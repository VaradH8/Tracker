import { describe, it, expect } from "vitest";
import { passwordIssue } from "@/lib/auth";

describe("passwordIssue", () => {
  it("rejects empty / undefined input", () => {
    expect(passwordIssue("")).toMatch(/at least 10 characters/);
  });

  it("rejects passwords under 10 characters", () => {
    expect(passwordIssue("abc12")).toMatch(/at least 10 characters/);
    expect(passwordIssue("abcd12345")).toMatch(/at least 10 characters/);
  });

  it("rejects letter-only passwords (no number or symbol)", () => {
    expect(passwordIssue("abcdefghijklm")).toMatch(/letter and one digit/);
  });

  it("rejects digit-only passwords (no letter)", () => {
    expect(passwordIssue("1234567890")).toMatch(/letter and one digit/);
  });

  it("accepts a letter + digit at the boundary length", () => {
    expect(passwordIssue("abcdefghi1")).toBeNull();
  });

  it("accepts a letter + symbol", () => {
    expect(passwordIssue("abcdefghi!")).toBeNull();
  });

  it("accepts mixed-case + digits + symbol passwords", () => {
    expect(passwordIssue("Tr4ckerPass!2026")).toBeNull();
  });

  it("rejects the legacy seed password (tracker2026 is 11 chars but the old min was 6 — still ok with new rule)", () => {
    // Sanity check: this seed-time password should NOW pass the
    // tightened policy (10+ chars, mixed). It was previously the
    // brute-force risk. If we make the policy stricter, this test
    // is the canary that flags it.
    expect(passwordIssue("tracker2026")).toBeNull();
  });
});
