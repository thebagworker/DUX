import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildSignMessage, verifySignature } from "../supabase/functions/_shared/siws.ts";

function makeKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyB58: bs58.encode(kp.publicKey),
    sign(message: string) {
      return bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
    },
  };
}

const params = {
  domain: "dux.example",
  wallet: "",
  tokenAddress: "So11111111111111111111111111111111111111112",
  nonce: "a".repeat(64),
  issuedAt: "2026-07-19T00:00:00.000Z",
};

describe("SIWS message + signature", () => {
  it("accepts a valid signature from the right wallet", () => {
    const kp = makeKeypair();
    const msg = buildSignMessage({ ...params, wallet: kp.publicKeyB58 });
    expect(verifySignature(msg, kp.sign(msg), kp.publicKeyB58)).toBe(true);
  });

  it("rejects a signature from a different wallet", () => {
    const kp = makeKeypair();
    const other = makeKeypair();
    const msg = buildSignMessage({ ...params, wallet: kp.publicKeyB58 });
    expect(verifySignature(msg, other.sign(msg), kp.publicKeyB58)).toBe(false);
  });

  it("rejects a signature over a tampered message", () => {
    const kp = makeKeypair();
    const msg = buildSignMessage({ ...params, wallet: kp.publicKeyB58 });
    const sig = kp.sign(msg);
    const tampered = buildSignMessage({
      ...params,
      wallet: kp.publicKeyB58,
      tokenAddress: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    });
    expect(verifySignature(tampered, sig, kp.publicKeyB58)).toBe(false);
  });

  it("rejects malformed inputs without throwing", () => {
    expect(verifySignature("msg", "not-base58-!!!", "also-not-!!!")).toBe(false);
    expect(
      verifySignature("msg", bs58.encode(new Uint8Array(10)), bs58.encode(new Uint8Array(32)))
    ).toBe(false);
  });

  it("message binds domain, wallet, token and nonce", () => {
    const kp = makeKeypair();
    const msg = buildSignMessage({ ...params, wallet: kp.publicKeyB58 });
    expect(msg).toContain(params.domain);
    expect(msg).toContain(kp.publicKeyB58);
    expect(msg).toContain(params.tokenAddress);
    expect(msg).toContain(params.nonce);
  });
});
