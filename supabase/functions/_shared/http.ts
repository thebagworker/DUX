import { env } from "./env.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

export function corsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  return null;
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

/** Public base URL of the API (used to build image URLs in responses). */
export function apiBase(): string {
  const explicit = env("PUBLIC_API_BASE");
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = env("SUPABASE_URL");
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
  return "http://localhost:8787";
}

/** Public URL of the frontend (used in the `url` field of profiles). */
export function frontendBase(): string {
  return (env("FRONTEND_URL") || "http://localhost:5173").replace(/\/$/, "");
}

/** Strip the /functions/v1 prefix the hosted runtime includes in the path. */
export function normalizedPath(req: Request): string {
  return new URL(req.url).pathname.replace(/^\/functions\/v1/, "");
}

// --- simple in-memory sliding-window rate limiter (per instance) ---
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
