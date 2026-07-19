# DUX

Free, open-source **Enhanced Token Info** for Solana tokens. Token teams and major holders can publish a banner, description and verified links for their token, authorized purely on-chain, at no cost. The data is served through an open, Dexscreener-compatible API that any trading platform can integrate. The token icon is **not** user-editable (impersonation protection); the server fills it in automatically from the token's on-chain metadata.

- **Frontend:** Vite + React + TypeScript + Tailwind
- **Backend:** Supabase Edge Functions (Deno) + Postgres. No dedicated server needed.
- **Wallets:** Phantom / Solflare via wallet-adapter

**Write access is verified on-chain.** A wallet can edit a token's info if it is the Metaplex metadata **update authority**, the **mint authority**, the **pump.fun creator**, or holds **>= 3%** of the supply. Verification is a free message signature (no transaction), checked server-side against Solana RPC.

Deployment: see [`DEPLOYMENT.md`](./DEPLOYMENT.md).
Integrators (trading platforms): see [`INTEGRATION.md`](./INTEGRATION.md).

## How it works

1. A user enters a token mint address and connects their wallet.
2. The server issues a single-use nonce; the wallet signs a plain message (SIWS-style, never a transaction).
3. The server verifies the ed25519 signature, then checks on-chain qualification via RPC.
4. On success it issues a 30-minute JWT scoped to exactly that token.
5. Banner uploads are fully decoded and re-encoded server-side (metadata stripped), links are validated, and everything is served instantly through the public API.

## Architecture

```
src/                      React frontend (landing, token editor, live feed, API docs)
supabase/
  migrations/0001_init.sql   DB schema (token_profiles, images, auth_nonces, audit_log)
  functions/
    auth/            POST /auth/nonce, POST /auth/verify  (SIWS + on-chain check -> JWT)
    profile/         PUT  /profile                        (banner/description/links)
    token-profiles/  GET  /token-profiles/...             (public Dexscreener-compatible API)
    _shared/         shared logic (runs identically under Deno and Node for tests)
scripts/
  serve-functions.ts   local Deno runner (all functions on :8787)
  e2e.mjs              end-to-end suite
tests/                 unit tests (signatures, validation, JWT, image pipeline, SSRF policy)
```

## Public API: what trading platforms integrate

Base URL: `https://<project-ref>.supabase.co/functions/v1`. CORS `*`, no API key, no auth.

**A terminal (Axiom / Padre / GMGN-style) needs exactly two endpoints:**

**1. When rendering a token page,** fetch the profile for that mint:

```
GET /token-profiles/solana/{tokenAddress}
```

```json
{
  "url": "https://<frontend>/token/<tokenAddress>",
  "chainId": "solana",
  "tokenAddress": "So11111111111111111111111111111111111111112",
  "icon": "https://<base>/token-profiles/images/<uuid>",
  "header": "https://<base>/token-profiles/images/<uuid>",
  "description": "...",
  "links": [{ "type": "twitter", "url": "https://x.com/example" }],
  "updatedAt": "2026-07-19T12:00:00.000Z"
}
```

Render `header` as the banner, `description` and `links` alongside your existing token info. `icon` is auto-populated by the server from the token's on-chain metadata (256x256 PNG, re-encoded); it is never user-editable and may be `null` if the metadata has no reachable image. 404 means no profile exists, show your default layout.

**2. (Optional) To pick up edits without per-page requests,** poll the change feed and upsert by `tokenAddress`:

```
GET /token-profiles/recent-updates/v1     // 50 most recently updated profiles
```

Poll every 15-30 s; responses are CDN-cached for 15 s. `updatedAt` tells you what changed. That's the whole integration.

Also available: `GET /token-profiles/latest/v1` (newest profiles first, same shape as Dexscreener's endpoint of the same path) and `GET /token-profiles/images/{id}` (banner JPEG, immutable cache). Field names and layout match the Dexscreener token-profiles schema, so an existing Dexscreener parser can be reused as-is. Full details and a fallback/merge pattern: [`INTEGRATION.md`](./INTEGRATION.md).

## Security model

- Single-use nonces (5 min TTL), marked used before signature verification: replay- and race-safe.
- The signed message is reconstructed server-side from stored nonce data; the client cannot alter wallet, token, nonce or domain.
- Signatures are plain messages, never transactions. They cannot move funds or grant approvals.
- JWTs are HS256, 30-minute TTL, scoped to a single token mint.
- Every banner upload is fully decoded and re-encoded with a pure-JS pipeline (jpeg-js + pngjs, no native code). EXIF/metadata and polyglot payloads are destroyed; output is a fixed 1500x500 JPEG.
- The token icon is not user-editable at all: holders cannot swap a token's identity image (impersonation protection). The server fetches it itself from the token's Metaplex metadata, with SSRF hardening (https only, no private hosts, validated redirects, byte caps, timeouts) and the same decode-or-reject re-encoding.
- Links must be public `https://` URLs. `javascript:`, `data:`, `http:`, credentialed URLs, raw IPs and private hosts are rejected.
- Image responses ship `X-Content-Type-Options: nosniff` and a deny-all CSP.
- Per-IP rate limits on auth and write endpoints.
- Every change is written to an append-only audit log with wallet and role.
- Row Level Security is enabled on all tables; PostgREST cannot touch them directly.

## Tests

```bash
npm test                # unit tests (Node)
# end-to-end (needs Postgres + Deno, starts a mock Solana RPC):
DATABASE_URL=... AUTH_SECRET=... SOLANA_RPC_URL=http://localhost:8899 \
deno run --allow-net --allow-env --allow-read \
  --import-map supabase/functions/import_map.json scripts/serve-functions.ts &
node scripts/e2e.mjs    # auth flows, replay, tampering, icon/banner pipeline, public API
```

## Trademark / non-affiliation

DUX is an independent community project. It is **not affiliated with, endorsed by, or connected to DEX Screener, Inc.** ("Dexscreener"). "Dexscreener" and related marks are the property of their respective owners; they are referenced only to describe API compatibility (nominative use). The site displays a permanent non-affiliation notice. If you fork or deploy this project, keep these notices intact.

## License

MIT, see [`LICENSE`](./LICENSE).
