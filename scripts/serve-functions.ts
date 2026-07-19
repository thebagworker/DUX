/**
 * Local dev/test runner: serves all three edge functions on one port (8787),
 * routing by path prefix, mirrors how the hosted /functions/v1 gateway routes.
 *
 * Usage:
 *   DATABASE_URL=... AUTH_SECRET=... SOLANA_RPC_URL=... \
 *   deno run --allow-net --allow-env scripts/serve-functions.ts
 */
import { handler as auth } from "../supabase/functions/auth/handler.ts";
import { handler as profile } from "../supabase/functions/profile/handler.ts";
import { handler as tokenProfiles } from "../supabase/functions/token-profiles/handler.ts";

Deno.serve({ port: 8787 }, (req) => {
  const path = new URL(req.url).pathname;
  if (path.startsWith("/auth/")) return auth(req);
  if (path.startsWith("/profile")) return profile(req);
  if (path.startsWith("/token-profiles")) return tokenProfiles(req);
  return new Response(JSON.stringify({ error: "not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});
