/**
 * Base URL of the backend (Supabase Edge Functions).
 *
 * In production this is:
 *   https://<project-ref>.supabase.co/functions/v1
 *
 * Set it via the VITE_API_BASE env var (see .env.example).
 * Falls back to the local dev runner.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8787";

/** RPC used by the wallet adapter in the browser (wallet plumbing only). */
export const BROWSER_RPC: string =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  "https://api.mainnet-beta.solana.com";

/** The project's own token — the MEMIPEDE DEX mint this site is branded around. */
export const MEMIPEDE_CONTRACT_ADDRESS =
  "6LLNiWXRZp8hn5oTFTHEo8ERbJS3QJfHSKhnTCqipump";
