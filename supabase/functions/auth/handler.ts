import { getDb } from "../_shared/db.ts";
import { buildSignMessage, verifySignature } from "../_shared/siws.ts";
import { qualifyWallet } from "../_shared/solana.ts";
import { issueEditToken, EDIT_TOKEN_TTL_SECONDS } from "../_shared/jwt.ts";
import { solanaAddressSchema } from "../_shared/validation.ts";
import { corsPreflight, json, rateLimit, clientIp, normalizedPath } from "../_shared/http.ts";
import { z } from "zod";

const NONCE_TTL_MS = 5 * 60 * 1000;

const nonceBody = z.object({
  wallet: solanaAddressSchema,
  tokenAddress: solanaAddressSchema,
});

const verifyBody = z.object({
  wallet: solanaAddressSchema,
  tokenAddress: solanaAddressSchema,
  nonce: z.string().min(32).max(128),
  signature: z.string().min(64).max(128),
});

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleNonce(req: Request): Promise<Response> {
  if (!rateLimit(`nonce:${clientIp(req)}`, 20, 60_000)) return json({ error: "rate limited" }, 429);

  let body;
  try {
    body = nonceBody.parse(await req.json());
  } catch {
    return json({ error: "invalid wallet or tokenAddress" }, 400);
  }

  const nonce = randomHex(32);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);

  const sql = getDb();
  // opportunistic cleanup of expired nonces
  await sql`DELETE FROM auth_nonces WHERE expires_at < now()`;
  await sql`
    INSERT INTO auth_nonces (nonce, wallet, token_address, expires_at)
    VALUES (${nonce}, ${body.wallet}, ${body.tokenAddress}, ${expiresAt.toISOString()})
  `;

  const domain = new URL(req.url).host;
  const message = buildSignMessage({
    domain,
    wallet: body.wallet,
    tokenAddress: body.tokenAddress,
    nonce,
    issuedAt: issuedAt.toISOString(),
  });

  return json({ nonce, issuedAt: issuedAt.toISOString(), message });
}

async function handleVerify(req: Request): Promise<Response> {
  if (!rateLimit(`verify:${clientIp(req)}`, 10, 60_000)) return json({ error: "rate limited" }, 429);

  let body;
  try {
    body = verifyBody.parse(await req.json());
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const sql = getDb();

  // 1. nonce must exist, match wallet+token, be unused and unexpired
  const rows = await sql`
    SELECT id, nonce, wallet, token_address, used, expires_at
    FROM auth_nonces WHERE nonce = ${body.nonce} AND used = false LIMIT 1
  `;
  const nonceRow = rows[0];
  if (!nonceRow || nonceRow.wallet !== body.wallet || nonceRow.token_address !== body.tokenAddress) {
    return json({ error: "unknown or mismatched nonce" }, 401);
  }
  const expiresAt = new Date(nonceRow.expires_at);
  if (expiresAt.getTime() < Date.now()) {
    return json({ error: "nonce expired, request a new one" }, 401);
  }

  // 2. mark used FIRST (single-use, race-safe)
  const updated = await sql`
    UPDATE auth_nonces SET used = true
    WHERE id = ${nonceRow.id} AND used = false
    RETURNING id
  `;
  if (updated.length === 0) return json({ error: "nonce already used" }, 401);

  // 3. reconstruct exact message server-side, verify ed25519 signature
  const issuedAt = new Date(expiresAt.getTime() - NONCE_TTL_MS);
  const domain = new URL(req.url).host;
  const message = buildSignMessage({
    domain,
    wallet: nonceRow.wallet,
    tokenAddress: nonceRow.token_address,
    nonce: nonceRow.nonce,
    issuedAt: issuedAt.toISOString(),
  });
  if (!verifySignature(message, body.signature, body.wallet)) {
    return json({ error: "invalid signature" }, 401);
  }

  // 4. on-chain qualification
  let result;
  try {
    result = await qualifyWallet(body.wallet, body.tokenAddress);
  } catch {
    return json({ error: "on-chain verification failed (RPC error), please retry" }, 502);
  }
  if (!result.qualified || !result.role) {
    return json({ error: "not authorized for this token", detail: result.detail }, 403);
  }

  const editToken = await issueEditToken({
    wallet: body.wallet,
    tokenAddress: body.tokenAddress,
    role: result.role,
  });

  return json({
    editToken,
    role: result.role,
    detail: result.detail,
    expiresInSeconds: EDIT_TOKEN_TTL_SECONDS,
  });
}

export async function handler(req: Request): Promise<Response> {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const path = normalizedPath(req);
  if (req.method === "POST" && path === "/auth/nonce") return handleNonce(req);
  if (req.method === "POST" && path === "/auth/verify") return handleVerify(req);
  return json({ error: "not found" }, 404);
}
