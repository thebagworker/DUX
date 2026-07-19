import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Sign-In-with-Solana style message. The server reconstructs this EXACT string
 * from its own stored nonce data and verifies the signature against it, so the
 * client cannot alter any field (wallet, token, nonce, domain).
 */
export function buildSignMessage(params: {
  domain: string;
  wallet: string;
  tokenAddress: string;
  nonce: string;
  issuedAt: string; // ISO string
}): string {
  return [
    `${params.domain} wants you to verify token authority with your Solana account:`,
    params.wallet,
    ``,
    `Authorize editing token info for:`,
    params.tokenAddress,
    ``,
    `This signature does NOT approve any transaction and costs nothing.`,
    ``,
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
  ].join("\n");
}

/** Verify an ed25519 signature (base58) over a UTF-8 message for a base58 pubkey. */
export function verifySignature(message: string, signatureB58: string, walletB58: string): boolean {
  try {
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(walletB58);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
  } catch {
    return false;
  }
}
