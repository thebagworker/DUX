export interface TokenLink {
  type?: string;
  label?: string;
  url: string;
}

export interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  name: string | null;
  symbol: string | null;
  icon: string | null;
  header: string | null;
  description: string | null;
  links: TokenLink[];
  updatedAt: string;
}

export const LINK_TYPES = ["website", "twitter", "telegram", "discord", "docs", "other"] as const;

export function shortenAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
