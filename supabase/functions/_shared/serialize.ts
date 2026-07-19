import { apiBase, frontendBase } from "./http.ts";

export interface ProfileRow {
  chain_id: string;
  token_address: string;
  description: string | null;
  icon_image_id: string | null;
  header_image_id: string | null;
  links: { type?: string; label?: string; url: string }[];
  updated_at: Date | string;
}

/**
 * Dexscreener-compatible token profile shape:
 * { url, chainId, tokenAddress, icon, header, description, links[] }
 */
export function serializeProfile(row: ProfileRow) {
  const base = apiBase();
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  return {
    url: `${frontendBase()}/token/${row.token_address}`,
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    // auto-populated by the server from the token's on-chain metadata; never user-editable
    icon: row.icon_image_id ? `${base}/token-profiles/images/${row.icon_image_id}` : null,
    header: row.header_image_id ? `${base}/token-profiles/images/${row.header_image_id}` : null,
    description: row.description ?? null,
    links: row.links ?? [],
    updatedAt: updatedAt.toISOString(),
  };
}
