import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { parseMetadataUri } from "../supabase/functions/_shared/solana.ts";
import { normalizeMetadataUrl } from "../supabase/functions/_shared/tokenicon.ts";

function metadataAccount(uri: string): Uint8Array {
  const ua = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBytes();
  const mint = new PublicKey("So11111111111111111111111111111111111111112").toBytes();
  const name = Buffer.alloc(32);
  name.write("Test Token");
  const symbol = Buffer.alloc(10);
  symbol.write("TEST");
  const uriBuf = Buffer.alloc(200);
  uriBuf.write(uri);
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([4]), Buffer.from(ua), Buffer.from(mint),
      u32(32), name, u32(10), symbol, u32(200), uriBuf,
      Buffer.alloc(20),
    ])
  );
}

describe("metadata URI parsing", () => {
  it("extracts the null-padded uri", () => {
    expect(parseMetadataUri(metadataAccount("https://example.com/meta.json"))).toBe(
      "https://example.com/meta.json"
    );
  });
  it("returns null for short/garbage buffers", () => {
    expect(parseMetadataUri(new Uint8Array(10))).toBeNull();
    expect(parseMetadataUri(new Uint8Array(70))).toBeNull();
  });
});

describe("icon fetch URL policy (SSRF hardening)", () => {
  it("accepts https and rewrites ipfs:// and ar://", () => {
    expect(normalizeMetadataUrl("https://example.com/a.json")).toBe("https://example.com/a.json");
    expect(normalizeMetadataUrl("ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBe(
      "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    );
    expect(normalizeMetadataUrl("ar://abc123")).toBe("https://arweave.net/abc123");
  });
  it("rejects dangerous or private targets", () => {
    for (const uri of [
      "http://example.com/a.json",
      "javascript:alert(1)",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://user:pass@example.com/x",
      "file:///etc/passwd",
      "",
    ]) {
      expect(normalizeMetadataUrl(uri), uri).toBeNull();
    }
  });
});
