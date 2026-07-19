/**
 * Runtime-agnostic env access: Deno in Supabase Edge Functions,
 * process.env when the same modules run under Node (unit tests).
 */
export function env(name: string): string | undefined {
  // @ts-ignore Deno global exists in the edge runtime
  if (typeof Deno !== "undefined" && Deno?.env?.get) return Deno.env.get(name);
  // @ts-ignore process exists under Node
  if (typeof process !== "undefined") return process.env?.[name];
  return undefined;
}
