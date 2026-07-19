import { getDb } from "../_shared/db.ts";
import { serializeProfile, type ProfileRow } from "../_shared/serialize.ts";
import { isValidSolanaAddress } from "../_shared/validation.ts";
import { corsPreflight, json, normalizedPath, CORS_HEADERS } from "../_shared/http.ts";

const CACHE = { "Cache-Control": "public, max-age=15, s-maxage=15" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Profile columns plus cached name/symbol/image from token_metadata.
const PROFILE_SELECT = `
  SELECT tp.*,
         tm.name AS meta_name,
         tm.symbol AS meta_symbol,
         tm.image_url AS meta_image_url
  FROM token_profiles tp
  LEFT JOIN token_metadata tm
    ON tm.chain_id = tp.chain_id AND tm.token_address = tp.token_address
`;

async function latest(): Promise<Response> {
  const sql = getDb();
  const rows = await sql.unsafe(`${PROFILE_SELECT} ORDER BY tp.created_at DESC LIMIT 50`);
  return json(
    (rows as unknown as ProfileRow[]).map(serializeProfile),
    200,
    CACHE
  );
}

async function recentUpdates(): Promise<Response> {
  const sql = getDb();
  const rows = await sql.unsafe(`${PROFILE_SELECT} ORDER BY tp.updated_at DESC LIMIT 50`);
  return json(
    (rows as unknown as ProfileRow[]).map(serializeProfile),
    200,
    CACHE
  );
}

async function single(chainId: string, tokenAddress: string): Promise<Response> {
  if (chainId !== "solana" || !isValidSolanaAddress(tokenAddress)) {
    return json({ error: "not found" }, 404, CACHE);
  }
  const sql = getDb();
  const rows = await sql.unsafe(
    `${PROFILE_SELECT} WHERE tp.chain_id = $1 AND tp.token_address = $2 LIMIT 1`,
    [chainId, tokenAddress]
  );
  if (rows.length === 0) return json({ error: "not found" }, 404, CACHE);
  return json(serializeProfile(rows[0] as unknown as ProfileRow), 200, CACHE);
}

async function image(id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return new Response("not found", { status: 404, headers: CORS_HEADERS });
  const sql = getDb();
  const rows = await sql`SELECT data, content_type FROM images WHERE id = ${id} LIMIT 1`;
  const img = rows[0];
  if (!img) return new Response("not found", { status: 404, headers: CORS_HEADERS });
  return new Response(new Uint8Array(img.data), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": img.content_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

export async function handler(req: Request): Promise<Response> {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const path = normalizedPath(req);
  const parts = path.split("/").filter(Boolean); // ["token-profiles", ...]
  if (parts[0] !== "token-profiles") return json({ error: "not found" }, 404);

  if (parts[1] === "latest" && parts[2] === "v1") return latest();
  if (parts[1] === "recent-updates" && parts[2] === "v1") return recentUpdates();
  if (parts[1] === "images" && parts[2]) return image(parts[2]);
  if (parts.length === 3) return single(parts[1], parts[2]);

  return json({ error: "not found" }, 404);
}
