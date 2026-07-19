import { apiBase, frontendBase } from "./http.ts";

export interface ProfileRow {
  chain_id: string;
  token_address: string;
  description: string | null;
  icon_image_id: string | null;
  header_image_id: string | null;
  links: { type?: string; label?: string; url: string }[];
  updated_at: Date | string;
  // Optional columns joined from token_metadata (pump.fun / on-chain cache).
  meta_name?: string | null;
  meta_symbol?: string | null;
  meta_image_url?: string | null;
}

/**
 * Dexscreener-compatible token profile shape:
 * { url, chainId, tokenAddress, icon, header, name, symbol, description, links[] }
 *
 * `name` / `symbol` and the icon fallback come from cached token metadata
 * (token_metadata), so a token shows a real name + logo even before the owner
 * uploads their own icon. An owner-uploaded icon always takes precedence.
 */
export function serializeProfile(row: ProfileRow) {
  const base = apiBase();
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  const uploadedIcon = row.icon_image_id
    ? `${base}/token-profiles/images/${row.icon_image_id}`
    : null;
  return {
    url: `${frontendBase()}/token/${row.token_address}`,
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    name: row.meta_name ?? null,
    symbol: row.meta_symbol ?? null,
    // owner-uploaded icon wins; otherwise fall back to cached metadata image
    icon: uploadedIcon ?? row.meta_image_url ?? null,
    header: row.header_image_id ? `${base}/token-profiles/images/${row.header_image_id}` : null,
    description: row.description ?? null,
    links: row.links ?? [],
    updatedAt: updatedAt.toISOString(),
  };
}
