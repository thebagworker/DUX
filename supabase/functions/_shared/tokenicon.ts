/**
 * Server-side fetch of a token's icon from its on-chain metadata.
 *
 * The icon is NEVER user-uploaded. The server resolves the Metaplex metadata
 * URI (usually IPFS/Arweave JSON), reads its `image` field, downloads the
 * image and runs it through the same decode-or-reject pipeline as banners.
 *
 * SSRF hardening: https only, no credentials, no private hosts/IP literals,
 * manual redirect handling with re-validation per hop, byte caps, timeouts.
 * (UNSAFE_ALLOW_HTTP_METADATA=1 relaxes https/localhost for the local E2E
 * suite only; never set it in production.)
 */
import { processIcon, type ProcessedImage } from "./images.ts";
import { env } from "./env.ts";

const MAX_JSON_BYTES = 200_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

function insecureAllowed(): boolean {
  return env("UNSAFE_ALLOW_HTTP_METADATA") === "1";
}

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (insecureAllowed()) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // raw IPv4
  if (h.startsWith("[")) return false; // IPv6 literal
  return true;
}

function urlAllowed(u: URL): boolean {
  if (u.username || u.password) return false;
  if (u.protocol === "https:") return hostAllowed(u.hostname);
  if (u.protocol === "http:" && insecureAllowed()) return true;
  return false;
}

/** Normalize ipfs:// and ar:// URIs to public HTTPS gateways. */
export function normalizeMetadataUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  let candidate = trimmed;
  if (candidate.startsWith("ipfs://")) {
    candidate = `https://ipfs.io/ipfs/${candidate.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  } else if (candidate.startsWith("ar://")) {
    candidate = `https://arweave.net/${candidate.slice("ar://".length)}`;
  }
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  return urlAllowed(u) ? u.toString() : null;
}

/** Fetch with byte cap, timeout, and manual redirect validation per hop. */
async function fetchCapped(startUrl: string, maxBytes: number): Promise<Uint8Array | null> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) return null;
      let next: URL;
      try {
        next = new URL(loc, url);
      } catch {
        return null;
      }
      if (!urlAllowed(next)) return null;
      url = next.toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > maxBytes) {
      await res.body?.cancel();
      return null;
    }
    try {
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.length > maxBytes ? null : buf;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Resolve a metadata URI to a processed 256x256 PNG icon, or null.
 * Never throws; every failure path returns null (icon stays empty).
 */
export async function fetchOnChainIcon(metadataUri: string): Promise<ProcessedImage | null> {
  try {
    const metaUrl = normalizeMetadataUrl(metadataUri);
    if (!metaUrl) return null;

    const metaBytes = await fetchCapped(metaUrl, MAX_JSON_BYTES);
    if (!metaBytes) return null;

    let imageBytes: Uint8Array | null = null;
    try {
      const json = JSON.parse(new TextDecoder().decode(metaBytes));
      const image = typeof json?.image === "string" ? json.image : null;
      if (image) {
        const imageUrl = normalizeMetadataUrl(image);
        if (imageUrl) imageBytes = await fetchCapped(imageUrl, MAX_IMAGE_BYTES);
      }
    } catch {
      // some URIs point directly at an image instead of JSON
      imageBytes = metaBytes;
    }
    if (!imageBytes) return null;

    return await processIcon(imageBytes);
  } catch {
    return null;
  }
}
