import { describe, it, expect, beforeAll } from "vitest";
import { issueEditToken, verifyEditToken } from "../supabase/functions/_shared/jwt.ts";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
});

describe("edit token JWT", () => {
  const grant = {
    wallet: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    tokenAddress: "So11111111111111111111111111111111111111112",
    role: "holder" as const,
  };

  it("round-trips a grant", async () => {
    const token = await issueEditToken(grant);
    expect(await verifyEditToken(`Bearer ${token}`)).toEqual(grant);
  });

  it("rejects tampered tokens", async () => {
    const token = await issueEditToken(grant);
    expect(await verifyEditToken(`Bearer ${token.slice(0, -3)}abc`)).toBeNull();
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await issueEditToken(grant);
    process.env.AUTH_SECRET = "another-secret-another-secret-another-00";
    expect(await verifyEditToken(`Bearer ${token}`)).toBeNull();
    process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
  });

  it("rejects missing/garbage headers", async () => {
    expect(await verifyEditToken(null)).toBeNull();
    expect(await verifyEditToken("Bearer not.a.jwt")).toBeNull();
  });
});
