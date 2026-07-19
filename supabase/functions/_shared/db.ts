import postgres from "postgres";
import { env } from "./env.ts";

let client: ReturnType<typeof postgres> | null = null;

/**
 * Postgres connection for short-lived edge isolates.
 *
 * Routes through the Supabase TRANSACTION POOLER (PgBouncer, port 6543) to
 * avoid exhausting the 60 direct connection slots ("remaining connection
 * slots are reserved", code 53300).
 *
 * Prefers an explicit DATABASE_URL (pooler URI). Otherwise it rewrites the
 * platform-injected SUPABASE_DB_URL (direct connection) into its pooler
 * equivalent so we never open a direct 5432 connection from edge isolates.
 */
function toPoolerUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Already a pooler URL — leave alone.
    if (u.hostname.includes("pooler.supabase.com")) return raw;
    // Direct URL looks like: db.<ref>.supabase.co:5432, user "postgres"
    const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.(co|com)$/i);
    if (!m) return raw;
    const ref = m[1];
    const region = env("SUPABASE_POOLER_REGION") ?? "ap-southeast-1";
    u.hostname = `aws-0-${region}.pooler.supabase.com`;
    u.port = "6543";
    u.username = `postgres.${ref}`;
    return u.toString();
  } catch {
    return raw;
  }
}

export function getDb() {
  if (!client) {
    const raw = env("DATABASE_URL") ?? env("SUPABASE_DB_URL");
    if (!raw) throw new Error("DATABASE_URL / SUPABASE_DB_URL not set");
    const url = toPoolerUrl(raw);
    client = postgres(url, {
      max: 1,
      prepare: false,
      fetch_types: false,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl:
        url.includes("supabase.co") || url.includes("supabase.com")
          ? "require"
          : undefined,
      onnotice: () => {},
    });
  }
  return client;
}
