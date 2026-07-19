import { getDb } from "../_shared/db.ts";
import { verifyEditToken } from "../_shared/jwt.ts";
import {
  profileUpdateSchema,
  MAX_BANNER_UPLOAD,
  ALLOWED_IMAGE_TYPES,
  isValidSolanaAddress,
} from "../_shared/validation.ts";
import { processBanner } from "../_shared/images.ts";
import { fetchOnChainIcon } from "../_shared/tokenicon.ts";
import { getMetadataAccount, parseMetadataUri } from "../_shared/solana.ts";
import { serializeProfile, type ProfileRow } from "../_shared/serialize.ts";
import { corsPreflight, json, rateLimit, clientIp, normalizedPath } from "../_shared/http.ts";

export async function handler(req: Request): Promise<Response> {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const path = normalizedPath(req);
  if (req.method !== "PUT" || path !== "/profile") return json({ error: "not found" }, 404);

  if (!rateLimit(`profile:${clientIp(req)}`, 15, 60_000)) return json({ error: "rate limited" }, 429);

  const grant = await verifyEditToken(req.headers.get("authorization"));
  if (!grant) return json({ error: "missing or invalid edit token" }, 401);
  if (!isValidSolanaAddress(grant.tokenAddress)) return json({ error: "invalid token in grant" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart/form-data" }, 400);
  }

  // --- text payload
  let payload: {
    description?: string | null;
    links?: { type?: string; label?: string; url: string }[];
  } = {};
  const rawPayload = form.get("payload");
  if (typeof rawPayload === "string" && rawPayload.length > 0) {
    try {
      payload = profileUpdateSchema.parse(JSON.parse(rawPayload));
    } catch (e) {
      return json({ error: "invalid payload", detail: String(e) }, 400);
    }
  }

  const sql = getDb();
  let bannerImageId: string | undefined;

  // --- banner
  const banner = form.get("banner");
  if (banner instanceof File && banner.size > 0) {
    if (banner.size > MAX_BANNER_UPLOAD) return json({ error: "banner exceeds 5 MB" }, 413);
    if (!ALLOWED_IMAGE_TYPES.includes(banner.type)) {
      return json({ error: "banner must be png/jpeg" }, 415);
    }
    try {
      const processed = await processBanner(new Uint8Array(await banner.arrayBuffer()));
      const rows = await sql`
        INSERT INTO images (data, content_type, bytes)
        VALUES (${processed.data as unknown as Buffer}, ${processed.contentType}, ${processed.bytes})
        RETURNING id
      `;
      bannerImageId = rows[0].id;
    } catch {
      return json({ error: "banner is not a valid image" }, 415);
    }
  }

  // --- upsert profile
  const existingRows = await sql`
    SELECT * FROM token_profiles
    WHERE chain_id = 'solana' AND token_address = ${grant.tokenAddress} LIMIT 1
  `;
  const existing = existingRows[0];

  let row: ProfileRow;
  if (existing) {
    const rows = await sql`
      UPDATE token_profiles SET
        description = ${payload.description !== undefined ? payload.description : existing.description},
        links = ${payload.links !== undefined ? sql.json(payload.links) : sql.json(existing.links)},
        header_image_id = ${bannerImageId ?? existing.header_image_id},
        updated_by = ${grant.wallet},
        updated_by_role = ${grant.role},
        updated_at = now()
      WHERE id = ${existing.id}
      RETURNING *
    `;
    row = rows[0] as unknown as ProfileRow;

    // delete replaced images so the DB stays bounded
    if (bannerImageId && existing.header_image_id) {
      await sql`DELETE FROM images WHERE id = ${existing.header_image_id}`;
    }
  } else {
    // Atomic upsert: if two first-time saves for the same token race,
    // the second one becomes an update instead of a unique-violation error.
    const rows = await sql`
      INSERT INTO token_profiles
        (chain_id, token_address, description, links, header_image_id, updated_by, updated_by_role)
      VALUES
        ('solana', ${grant.tokenAddress}, ${payload.description ?? null},
         ${sql.json(payload.links ?? [])}, ${bannerImageId ?? null},
         ${grant.wallet}, ${grant.role})
      ON CONFLICT (chain_id, token_address) DO UPDATE SET
        description = EXCLUDED.description,
        links = EXCLUDED.links,
        header_image_id = COALESCE(EXCLUDED.header_image_id, token_profiles.header_image_id),
        updated_by = EXCLUDED.updated_by,
        updated_by_role = EXCLUDED.updated_by_role,
        updated_at = now()
      RETURNING *
    `;
    row = rows[0] as unknown as ProfileRow;
  }

  // Best-effort: populate the token icon from on-chain metadata (never user-editable).
  if (!row.icon_image_id) {
    try {
      const meta = await getMetadataAccount(grant.tokenAddress);
      const uri = meta ? parseMetadataUri(meta) : null;
      const icon = uri ? await fetchOnChainIcon(uri) : null;
      if (icon) {
        const imgRows = await sql`
          INSERT INTO images (data, content_type, bytes)
          VALUES (${icon.data as unknown as Buffer}, ${icon.contentType}, ${icon.bytes})
          RETURNING id
        `;
        const updatedRows = await sql`
          UPDATE token_profiles SET icon_image_id = ${imgRows[0].id}
          WHERE id = ${(row as unknown as { id: string }).id} AND icon_image_id IS NULL
          RETURNING *
        `;
        if (updatedRows[0]) {
          row = updatedRows[0] as unknown as ProfileRow;
        } else {
          await sql`DELETE FROM images WHERE id = ${imgRows[0].id}`;
        }
      }
    } catch {
      /* icon backfill must never fail the save */
    }
  }

  await sql`
    INSERT INTO audit_log (token_address, wallet, role, action, detail)
    VALUES (${grant.tokenAddress}, ${grant.wallet}, ${grant.role},
            ${existing ? "update" : "create"},
            ${sql.json({
              changed: [
                ...(payload.description !== undefined ? ["description"] : []),
                ...(payload.links !== undefined ? ["links"] : []),
                ...(bannerImageId ? ["header"] : []),
              ],
            })})
  `;

  return json({ ok: true, profile: serializeProfile(row) });
}
