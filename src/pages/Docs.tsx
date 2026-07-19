import { API_BASE } from "../lib/config";

const th = "border-b border-line px-2.5 py-2 text-left font-semibold text-ink-dim";
const td = "border-b border-line px-2.5 py-2 align-top";
const code = "font-mono text-[13px]";
const pre =
  "my-2 block overflow-x-auto rounded-lg border border-line bg-bg-soft px-3.5 py-2.5 font-mono text-[13px] whitespace-pre";

export default function Docs() {
  return (
    <div className="pb-10">
      <h1 className="text-3xl font-bold">API Documentation</h1>
      <p className="mt-2 text-ink-dim">
        Public, free API without keys. The response format is compatible with the Dexscreener
        token-profiles schema: integrators can reuse the same parser and just add the base URL.
        CORS: <code className={code}>Access-Control-Allow-Origin: *</code>.
      </p>
      <p className="mt-2 text-ink-dim">
        Base URL of this instance: <code className={code}>{API_BASE}</code>
      </p>

      <h2 className="mt-9 border-b border-line pb-2 text-xl font-semibold">Endpoints</h2>
      <table className="my-3 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>Method</th>
            <th className={th}>Path</th>
            <th className={th}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>GET</td>
            <td className={`${td} ${code}`}>/token-profiles/latest/v1</td>
            <td className={td}>Newest token profiles (max 50), same schema as Dexscreener</td>
          </tr>
          <tr>
            <td className={td}>GET</td>
            <td className={`${td} ${code}`}>/token-profiles/recent-updates/v1</td>
            <td className={td}>Most recently updated profiles (max 50)</td>
          </tr>
          <tr>
            <td className={td}>GET</td>
            <td className={`${td} ${code}`}>/token-profiles/solana/{"{tokenAddress}"}</td>
            <td className={td}>Single profile by mint address (404 if none)</td>
          </tr>
          <tr>
            <td className={td}>GET</td>
            <td className={`${td} ${code}`}>/token-profiles/images/{"{id}"}</td>
            <td className={td}>Banner/icon image (JPEG/PNG, cached immutable)</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-9 border-b border-line pb-2 text-xl font-semibold">Response schema</h2>
      <pre className={pre}>{`{
  "url": "https://<frontend>/token/<tokenAddress>",
  "chainId": "solana",
  "tokenAddress": "So11111111111111111111111111111111111111112",
  "icon": "<base>/token-profiles/images/<uuid>",
  "header": "<base>/token-profiles/images/<uuid>",
  "description": "…",
  "links": [
    { "type": "website", "url": "https://example.com" },
    { "type": "twitter", "url": "https://x.com/example" }
  ],
  "updatedAt": "2026-07-19T12:00:00.000Z"
}`}</pre>

      <h2 className="mt-9 border-b border-line pb-2 text-xl font-semibold">
        Integration (Axiom / Padre / GMGN-style frontends)
      </h2>
      <p className="mt-2 text-ink-dim">
        Fallback pattern: query Dexscreener first, then this API when no profile exists. Or merge
        both (this API provides <code className={code}>updatedAt</code> for conflict resolution):
      </p>
      <pre className={pre}>{`const res = await fetch(
  \`${API_BASE}/token-profiles/solana/\${mint}\`
);
if (res.ok) {
  const profile = await res.json();
  // identical field layout to Dexscreener token-profiles
  render(profile.header, profile.description, profile.links);
}`}</pre>

      <h2 className="mt-9 border-b border-line pb-2 text-xl font-semibold">
        Verification (how write access works)
      </h2>
      <table className="my-3 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>Step</th>
            <th className={th}>What happens</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${td} ${code}`}>POST /auth/nonce</td>
            <td className={td}>
              Server creates a single-use nonce (valid 5 min) and the message to sign
            </td>
          </tr>
          <tr>
            <td className={td}>Wallet signature</td>
            <td className={td}>Phantom/Solflare signs the message (no transaction, free)</td>
          </tr>
          <tr>
            <td className={`${td} ${code}`}>POST /auth/verify</td>
            <td className={td}>
              Ed25519 check + on-chain check: Metaplex update authority, mint authority,
              pump.fun creator, or ≥3% of supply. On success: JWT (30 min), scoped to exactly
              this token.
            </td>
          </tr>
          <tr>
            <td className={`${td} ${code}`}>PUT /profile</td>
            <td className={td}>
              Multipart update: banner (→1500×500 JPEG), description, links (https only).
              Banners are re-encoded server-side, metadata stripped. The `icon` field in the
              API is always null (schema compatibility only); integrators use their own icon source.
            </td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-9 border-b border-line pb-2 text-xl font-semibold">Rate limits</h2>
      <p className="mt-2 text-ink-dim">
        Read endpoints: cached (15 s). Write/auth endpoints: 10-20 requests/min per IP.
      </p>
    </div>
  );
}
