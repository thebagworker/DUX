/**
 * End-to-end smoke test against the local function runner (scripts/serve-functions.ts on :8787)
 * + local Postgres + a mock Solana RPC this script starts on :8899.
 */
import http from "node:http";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey, Keypair } from "@solana/web3.js";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const BASE = "http://localhost:8787";
const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const devWallet = Keypair.generate(); // metadata update authority
const poorWallet = Keypair.generate(); // 1%
const richWallet = Keypair.generate(); // exactly 3%
const mint = Keypair.generate().publicKey;

const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("metadata"), METAPLEX.toBuffer(), mint.toBuffer()],
  METAPLEX
);

const SUPPLY = 1_000_000_000n;
let onChainIconPng = null; // built before server start (blue 300x300 PNG)
const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    if (req.url === "/meta.json") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ name: "E2E Token", symbol: "E2E", image: "http://localhost:8899/icon.png" }));
    }
    if (req.url === "/icon.png") {
      res.setHeader("Content-Type", "image/png");
      return res.end(Buffer.from(onChainIconPng));
    }
    res.statusCode = 404;
    return res.end("not found");
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { id, method, params } = JSON.parse(body);
    const reply = (result) =>
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: { context: { slot: 1 }, value: result } }));

    if (method === "getAccountInfo") {
      const addr = params[0];
      const enc = params[1]?.encoding;
      if (addr === mint.toBase58() && enc === "jsonParsed") {
        return reply({
          data: { program: "spl-token", parsed: { type: "mint", info: { mintAuthority: null, supply: SUPPLY.toString(), decimals: 6 } }, space: 82 },
          executable: false, lamports: 1, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", rentEpoch: 0,
        });
      }
      if (addr === metadataPda.toBase58()) {
        const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
        const name = Buffer.alloc(32); name.write("E2E Token");
        const symbol = Buffer.alloc(10); symbol.write("E2E");
        const uri = Buffer.alloc(200); uri.write("http://localhost:8899/meta.json");
        const data = Buffer.concat([
          Buffer.from([4]), devWallet.publicKey.toBuffer(), mint.toBuffer(),
          u32(32), name, u32(10), symbol, u32(200), uri, Buffer.alloc(20),
        ]);
        return reply({ data: [data.toString("base64"), "base64"], executable: false, lamports: 1, owner: METAPLEX.toBase58(), rentEpoch: 0 });
      }
      return reply(null);
    }
    if (method === "getTokenSupply") {
      return reply({ amount: SUPPLY.toString(), decimals: 6, uiAmount: 1000, uiAmountString: "1000" });
    }
    if (method === "getTokenAccountsByOwner") {
      const owner = params[0];
      const amount =
        owner === poorWallet.publicKey.toBase58()
          ? (SUPPLY / 100n).toString()
          : owner === richWallet.publicKey.toBase58()
            ? ((SUPPLY * 3n) / 100n).toString()
            : "0";
      return reply([
        {
          pubkey: Keypair.generate().publicKey.toBase58(),
          account: {
            data: { program: "spl-token", parsed: { type: "account", info: { mint: mint.toBase58(), owner, tokenAmount: { amount, decimals: 6 } } }, space: 165 },
            executable: false, lamports: 1, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", rentEpoch: 0,
          },
        },
      ]);
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `mock: unknown ${method}` } }));
  });
});

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    failures++;
    console.error(`  ✘ ${name} ${extra}`);
  }
}

async function auth(keypair) {
  const wallet = keypair.publicKey.toBase58();
  const tokenAddress = mint.toBase58();
  const nonceRes = await fetch(`${BASE}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, tokenAddress }),
  });
  const { nonce, message } = await nonceRes.json();
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey));
  const verifyRes = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, tokenAddress, nonce, signature }),
  });
  return { status: verifyRes.status, data: await verifyRes.json(), nonce, signature, wallet, tokenAddress };
}

async function makePng(w, h, [r, g, b] = [20, 200, 120]) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(png));
}

onChainIconPng = await makePng(300, 300, [30, 60, 240]); // blue on-chain icon
await new Promise((r) => server.listen(8899, r));
console.log(`mock RPC on :8899 | mint=${mint.toBase58()}`);

console.log("\n[1] dev wallet (update authority) verification");
const ok = await auth(devWallet);
check("verify returns 200", ok.status === 200, JSON.stringify(ok.data));
check("role is authority", ok.data.role === "authority");
check("editToken issued", typeof ok.data.editToken === "string" && ok.data.editToken.length > 20);

console.log("\n[2] nonce replay is rejected");
const replayRes = await fetch(`${BASE}/auth/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: ok.wallet, tokenAddress: ok.tokenAddress, nonce: ok.nonce, signature: ok.signature }),
});
check("replay returns 401", replayRes.status === 401);

console.log("\n[3] tampered signature is rejected");
{
  const wallet = devWallet.publicKey.toBase58();
  const tokenAddress = mint.toBase58();
  const nres = await fetch(`${BASE}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, tokenAddress }),
  });
  const { nonce } = await nres.json();
  const badSig = bs58.encode(nacl.sign.detached(new TextEncoder().encode("wrong message"), devWallet.secretKey));
  const vres = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, tokenAddress, nonce, signature: badSig }),
  });
  check("tampered sig returns 401", vres.status === 401);
}

console.log("\n[4] 1% holder is rejected");
const poor = await auth(poorWallet);
check("verify returns 403", poor.status === 403, JSON.stringify(poor.data));
check("detail mentions threshold", String(poor.data.detail || "").includes("below"));

console.log("\n[4b] 3% holder is accepted");
const rich = await auth(richWallet);
check("verify returns 200", rich.status === 200, JSON.stringify(rich.data));
check("role is holder", rich.data.role === "holder");

console.log("\n[5] profile update (banner + links)");
const banner = await makePng(900, 300, [20, 200, 120]);
const form = new FormData();
form.set("payload", JSON.stringify({
  description: "E2E test token",
  links: [
    { type: "website", url: "https://example.com" },
    { type: "twitter", url: "https://x.com/example" },
  ],
}));
form.set("banner", new File([banner], "banner.png", { type: "image/png" }));
// attacker-style attempt: uploading an "icon" field must be IGNORED by the server
form.set("icon", new File([await makePng(64, 64, [255, 0, 0])], "icon.png", { type: "image/png" }));
const putRes = await fetch(`${BASE}/profile`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${ok.data.editToken}` },
  body: form,
});
const putData = await putRes.json();
check("PUT returns 200", putRes.status === 200, JSON.stringify(putData));
check("profile has header url", !!putData.profile?.header);
check("icon auto-populated from on-chain metadata", typeof putData.profile?.icon === "string");
check("links round-trip", putData.profile?.links?.length === 2);

console.log("\n[6] malicious inputs rejected");
{
  const badForm = new FormData();
  badForm.set("payload", JSON.stringify({ links: [{ url: "javascript:alert(1)" }] }));
  const r = await fetch(`${BASE}/profile`, { method: "PUT", headers: { Authorization: `Bearer ${ok.data.editToken}` }, body: badForm });
  check("javascript: link returns 400", r.status === 400);

  const fakeImg = new FormData();
  fakeImg.set("banner", new File([Buffer.from("<html><script>alert(1)</script>")], "x.png", { type: "image/png" }));
  const r2 = await fetch(`${BASE}/profile`, { method: "PUT", headers: { Authorization: `Bearer ${ok.data.editToken}` }, body: fakeImg });
  check("fake image returns 415", r2.status === 415);

  const noAuth = await fetch(`${BASE}/profile`, { method: "PUT", body: new FormData() });
  check("missing token returns 401", noAuth.status === 401);
}

console.log("\n[7] public API endpoints");
{
  const single = await fetch(`${BASE}/token-profiles/solana/${mint.toBase58()}`);
  const sp = await single.json();
  check("single profile 200", single.status === 200);
  check(
    "shape: chainId/tokenAddress/icon/header/description/links",
    sp.chainId === "solana" && sp.tokenAddress === mint.toBase58() && "icon" in sp && "header" in sp && "description" in sp && Array.isArray(sp.links)
  );
  check("CORS header set", single.headers.get("access-control-allow-origin") === "*");

  const latest = await fetch(`${BASE}/token-profiles/latest/v1`);
  const lp = await latest.json();
  check("latest 200 + contains our token", latest.status === 200 && lp.some((p) => p.tokenAddress === mint.toBase58()));

  const updates = await fetch(`${BASE}/token-profiles/recent-updates/v1`);
  check("recent-updates 200", updates.status === 200);

  const imgRes = await fetch(sp.header);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const meta = jpeg.decode(buf, { formatAsRGBA: true });
  check(
    "banner served as JPEG 1500x500",
    imgRes.headers.get("content-type") === "image/jpeg" && meta.width === 1500 && meta.height === 500,
    `got ${imgRes.headers.get("content-type")} ${meta.width}x${meta.height}`
  );

  const iconRes = await fetch(sp.icon);
  const iconBuf = Buffer.from(await iconRes.arrayBuffer());
  const iconPng = PNG.sync.read(iconBuf);
  const px = { r: iconPng.data[0], g: iconPng.data[1], b: iconPng.data[2] };
  check(
    "icon served as 256x256 PNG from on-chain metadata (blue, not uploaded red)",
    iconRes.headers.get("content-type") === "image/png" && iconPng.width === 256 && iconPng.height === 256 && px.b > 150 && px.r < 100,
    `got ${iconRes.headers.get("content-type")} ${iconPng.width}x${iconPng.height} rgb(${px.r},${px.g},${px.b})`
  );

  const missing = await fetch(`${BASE}/token-profiles/solana/${Keypair.generate().publicKey.toBase58()}`);
  check("unknown token returns 404", missing.status === 404);
}

server.close();
console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} E2E CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
