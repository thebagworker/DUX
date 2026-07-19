import postgres from "postgres";
import { env } from "./env.ts";

let client: ReturnType<typeof postgres> | null = null;

/**
 * Direct Postgres connection.
 * - In Supabase Edge Functions, SUPABASE_DB_URL is injected automatically.
 * - Locally / in tests, set DATABASE_URL.
 */
export function getDb() {
  if (!client) {
    const url = env("SUPABASE_DB_URL") ?? env("DATABASE_URL");
    if (!url) throw new Error("SUPABASE_DB_URL / DATABASE_URL not set");
    client = postgres(url, {
      max: 2,
      prepare: false,
      ssl: url.includes("supabase.co") || url.includes("pooler.supabase.com") ? "require" : undefined,
    });
  }
  return client;
}
