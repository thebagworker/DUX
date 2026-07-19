import { PublicKey } from "@solana/web3.js";
import { env } from "./env.ts";

export type QualifyRole = "authority" | "holder" | "creator";

export interface QualifyResult {
  qualified: boolean;
  role?: QualifyRole;
  percent?: number;
  detail: string;
}

const METAPLEX_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const PUMP_FUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export function rpcUrl(): string {
  return env("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
}

export function holderThresholdPercent(): number {
  const raw = Number(env("HOLDER_THRESHOLD_PERCENT"));
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

/** Minimal JSON-RPC client (fetch-based, no Connection, works in any runtime). */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result as T;
}

export function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("metadata"), METAPLEX_METADATA_PROGRAM.toBytes(), mint.toBytes()],
    METAPLEX_METADATA_PROGRAM
  );
  return pda;
}

export function bondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("bonding-curve"), mint.toBytes()],
    PUMP_FUN_PROGRAM
  );
  return pda;
}

/** Metadata layout: byte 0 key, bytes 1..33 update_authority, 33..65 mint. */
export function parseUpdateAuthority(data: Uint8Array): string | null {
  if (data.length < 65) return null;
  return new PublicKey(data.subarray(1, 33)).toBase58();
}

/**
 * Parse the metadata URI out of a Metaplex token-metadata account.
 * Layout after key(1) + updateAuthority(32) + mint(32) = offset 65:
 * name (u32 len + bytes), symbol (u32 len + bytes), uri (u32 len + bytes),
 * strings are null-padded inside their allocated length.
 */
export function parseMetadataUri(data: Uint8Array): string | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let off = 65;
    const nameLen = view.getUint32(off, true);
    off += 4 + nameLen;
    const symbolLen = view.getUint32(off, true);
    off += 4 + symbolLen;
    const uriLen = view.getUint32(off, true);
    off += 4;
    if (uriLen > 500 || off + uriLen > data.length) return null;
    const raw = new TextDecoder().decode(data.subarray(off, off + uriLen));
    const nullIdx = raw.indexOf("\u0000");
    const uri = (nullIdx === -1 ? raw : raw.slice(0, nullIdx)).trim();
    return uri.length > 0 ? uri : null;
  } catch {
    return null;
  }
}

/** Fetch the raw Metaplex metadata account for a mint (base64), or null. */
export async function getMetadataAccount(mintStr: string): Promise<Uint8Array | null> {
  return getAccountInfoRaw(metadataPda(new PublicKey(mintStr)).toBase58());
}

/** Pump.fun bonding curve: 8 disc + 40 u64s + 1 bool = 49, then creator (32). */
export function parsePumpFunCreator(data: Uint8Array): string | null {
  if (data.length < 81) return null;
  const creator = new PublicKey(data.subarray(49, 81)).toBase58();
  if (creator === "11111111111111111111111111111111") return null;
  return creator;
}

/** BigInt percentage with 4 decimals of precision. */
export function computePercent(heldRaw: bigint, supplyRaw: bigint): number {
  if (supplyRaw <= BigInt(0)) return 0;
  const scaled = (heldRaw * BigInt(1_000_000)) / supplyRaw;
  return Number(scaled) / 10_000;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface AccountInfoValue {
  data: [string, string] | { parsed?: { type?: string; info?: Record<string, unknown> } };
}

async function getAccountInfoRaw(address: string): Promise<Uint8Array | null> {
  const r = await rpc<{ value: AccountInfoValue | null }>("getAccountInfo", [
    address,
    { encoding: "base64" },
  ]);
  if (!r.value) return null;
  const d = r.value.data;
  if (Array.isArray(d)) return b64ToBytes(d[0]);
  return null;
}

async function getAccountInfoParsed(address: string) {
  const r = await rpc<{ value: AccountInfoValue | null }>("getAccountInfo", [
    address,
    { encoding: "jsonParsed" },
  ]);
  if (!r.value) return null;
  const d = r.value.data;
  return !Array.isArray(d) && d.parsed ? d.parsed : null;
}

/**
 * Checks whether `wallet` qualifies to edit token info for `mint`:
 * mint/update authority, pump.fun creator, or >= threshold % holder.
 */
export async function qualifyWallet(walletStr: string, mintStr: string): Promise<QualifyResult> {
  const mint = new PublicKey(mintStr);

  // 0. mint must exist and be a token mint
  const parsedMint = await getAccountInfoParsed(mintStr);
  if (!parsedMint) return { qualified: false, detail: "mint account not found" };
  if (parsedMint.type !== "mint") return { qualified: false, detail: "address is not a token mint" };

  // 1. mint authority
  const mintAuthority = (parsedMint.info as { mintAuthority?: string | null })?.mintAuthority ?? null;
  if (mintAuthority && mintAuthority === walletStr) {
    return { qualified: true, role: "authority", detail: "wallet is the mint authority" };
  }

  // 2. Metaplex update authority
  try {
    const meta = await getAccountInfoRaw(metadataPda(mint).toBase58());
    if (meta) {
      const ua = parseUpdateAuthority(meta);
      if (ua && ua === walletStr) {
        return {
          qualified: true,
          role: "authority",
          detail: "wallet is the Metaplex metadata update authority",
        };
      }
    }
  } catch {
    /* best effort */
  }

  // 3. pump.fun creator
  try {
    const curve = await getAccountInfoRaw(bondingCurvePda(mint).toBase58());
    if (curve) {
      const creator = parsePumpFunCreator(curve);
      if (creator && creator === walletStr) {
        return { qualified: true, role: "creator", detail: "wallet is the pump.fun creator" };
      }
    }
  } catch {
    /* best effort */
  }

  // 4. holder >= threshold %
  const threshold = holderThresholdPercent();
  const supplyResp = await rpc<{ value: { amount: string } }>("getTokenSupply", [mintStr]);
  const supplyRaw = BigInt(supplyResp.value.amount);
  if (supplyRaw <= BigInt(0)) return { qualified: false, detail: "token has zero supply" };

  const accounts = await rpc<{
    value: { account: { data: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[];
  }>("getTokenAccountsByOwner", [walletStr, { mint: mintStr }, { encoding: "jsonParsed" }]);

  let heldRaw = BigInt(0);
  for (const { account } of accounts.value) {
    const amt = account.data?.parsed?.info?.tokenAmount?.amount;
    if (typeof amt === "string") heldRaw += BigInt(amt);
  }
  const percent = computePercent(heldRaw, supplyRaw);

  if (percent >= threshold) {
    return {
      qualified: true,
      role: "holder",
      percent,
      detail: `wallet holds ${percent.toFixed(2)}% (threshold ${threshold}%)`,
    };
  }
  return {
    qualified: false,
    percent,
    detail: `wallet holds ${percent.toFixed(4)}%, below the ${threshold}% threshold and not an authority/creator`,
  };
}
