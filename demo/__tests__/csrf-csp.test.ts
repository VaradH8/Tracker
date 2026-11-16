import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { crossOriginRefusal } from "@/lib/csrf";
import { middleware } from "@/middleware";
import type { NextConfig } from "next";
// @ts-expect-error -- plain .mjs config with no type declarations
import rawConfig from "@/next.config.mjs";

const nextConfig = rawConfig as NextConfig;

/**
 * E10: state-changing API calls must come from this site's own pages.
 * E9: pages carry a Content-Security-Policy; API responses don't.
 */

function req(method: string, headers: Record<string, string>) {
  return new NextRequest("https://tracker.example.com/api/tasks", {
    method,
    headers: { host: "tracker.example.com", ...headers },
  });
}

describe("Origin check on the API (E10)", () => {
  it("allows a same-origin POST from the app", () => {
    expect(crossOriginRefusal(req("POST", { origin: "https://tracker.example.com" }))).toBeNull();
  });

  it("refuses a POST from a sibling subdomain", () => {
    expect(crossOriginRefusal(req("POST", { origin: "https://other.example.com" }))).not.toBeNull();
    expect(middleware(req("DELETE", { origin: "https://other.example.com" })).status).toBe(403);
  });

  it("refuses anything the browser marks cross-site", () => {
    expect(crossOriginRefusal(req("PATCH", { "sec-fetch-site": "cross-site" }))).not.toBeNull();
  });

  it("never blocks reads", () => {
    expect(crossOriginRefusal(req("GET", { origin: "https://other.example.com" }))).toBeNull();
  });

  it("lets non-browser clients without an Origin through", () => {
    expect(crossOriginRefusal(req("POST", {}))).toBeNull();
  });

  it("uses the forwarded host behind a proxy", () => {
    const r = req("POST", {
      host: "app:3000",
      "x-forwarded-host": "tracker.example.com",
      origin: "https://tracker.example.com",
    });
    expect(crossOriginRefusal(r)).toBeNull();
  });
});

describe("Content-Security-Policy (E9)", () => {
  it("is set for pages but not for /api/*", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))!;
    const re = new RegExp(`^${csp.source}$`);
    expect(re.test("/my-day")).toBe(true);
    expect(re.test("/engineering/task-log")).toBe(true);
    expect(re.test("/api/tasks")).toBe(false);
    const value = csp.headers[0].value;
    expect(value).toContain("default-src 'self'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("frame-ancestors 'self'");
  });
});
