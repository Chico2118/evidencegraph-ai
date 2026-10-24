import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientKey,
  decideDemoRequest,
  DEMO_LIMITS,
  FixedWindowLimiter,
  isAllowedApi,
  isBlockedPage,
  isDemoMode,
} from "./demo-policy";

// ---- every real API route, read from the source tree -------------------------------------------------------

const API_ROOT = join(__dirname, "..", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** [METHOD, "/api/pages/sample/backlinks"] for every exported handler, with [slug]-style segments filled in. */
function allRoutes(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of routeFiles(API_ROOT)) {
    const url = "/api/" + relative(API_ROOT, join(file, "..")).split(sep).join("/").replace(/\[[^\]]+\]/g, "sample");
    const path = url.replace(/\/$/, "");
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)) out.push([m[1]!, path]);
  }
  return out;
}

const EXPECTED_ALLOWED = [
  "GET /api/contradictions",
  "GET /api/health",
  "GET /api/index",
  "GET /api/lint/history",
  "GET /api/pages",
  "GET /api/pages/sample",
  "GET /api/pages/sample/backlinks",
  "GET /api/research",
  "GET /api/schema",
  "GET /api/settings",
  "GET /api/sources",
  "GET /api/sources/sample",
  "POST /api/query",
];

describe("demo mode API allow-list, checked against every real route in the source tree", () => {
  const routes = allRoutes();

  it("finds the routes (guards against this test silently checking nothing)", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it("allows exactly the intended calls and refuses every other route and method", () => {
    const allowed = routes.filter(([m, p]) => isAllowedApi(m, p)).map(([m, p]) => `${m} ${p}`).sort();
    expect(allowed).toEqual([...EXPECTED_ALLOWED].sort());
  });

  it("refuses every write (POST/PUT/PATCH/DELETE) except answering a question", () => {
    const writes = routes.filter(([m]) => m !== "GET");
    expect(writes.length).toBeGreaterThan(15);
    for (const [m, p] of writes) {
      expect(isAllowedApi(m, p), `${m} ${p}`).toBe(m === "POST" && p === "/api/query");
    }
  });

  it("refuses the sensitive reads: API key status, workspace list and export, usage", () => {
    for (const p of ["/api/config", "/api/config/test", "/api/wikis", "/api/wikis/export", "/api/wikis/pages", "/api/wikis/health", "/api/usage", "/api/onboarding", "/api/chats", "/api/ingest"]) {
      expect(isAllowedApi("GET", p), p).toBe(false);
    }
  });

  it("is not fooled by look-alike paths", () => {
    for (const p of ["/api/query/", "/api/query/x", "//api/query", "/api/QUERY", "/api/pages/a/b", "/api/pages//x", "/api/health/extra", "/api/queryx"]) {
      expect(isAllowedApi("POST", p) || isAllowedApi("GET", p), p).toBe(false);
    }
  });
});

describe("decideDemoRequest", () => {
  const base = { client: "1.1.1.1", now: 0, limiter: new FixedWindowLimiter() };
  const decide = (method: string, pathname: string, client = base.client) =>
    decideDemoRequest({ method, pathname, client, now: base.now, limiter: new FixedWindowLimiter() });

  it("refuses a refused API call with 403 and a plain message", () => {
    expect(decide("POST", "/api/ingest")).toMatchObject({ action: "deny", status: 403 });
    expect(decide("DELETE", "/api/pages/x")).toMatchObject({ action: "deny", status: 403 });
    expect(decide("GET", "/api/wikis/export")).toMatchObject({ action: "deny", status: 403 });
  });

  it("allows reading pages, and rewrites the blocked screens to the notice page", () => {
    for (const p of ["/", "/query", "/sources", "/sources/abc", "/wiki", "/wiki/cell-aging", "/graph", "/contradictions", "/evaluation", "/about"]) {
      expect(decide("GET", p), p).toEqual({ action: "allow" });
    }
    for (const p of ["/settings", "/settings/anything", "/dashboard", "/local-models", "/chats", "/chats/123"]) {
      expect(decide("GET", p), p).toEqual({ action: "rewrite", to: "/demo-disabled" });
    }
    expect(isBlockedPage("/settingsx")).toBe(false); // whole segments only
  });

  it("refuses non-read verbs on a page", () => {
    expect(decide("POST", "/wiki")).toMatchObject({ action: "deny", status: 405 });
    expect(decide("DELETE", "/")).toMatchObject({ action: "deny", status: 405 });
  });

  it("limits questions per client far more tightly than everything else", () => {
    const limiter = new FixedWindowLimiter();
    const q = () => decideDemoRequest({ method: "POST", pathname: "/api/query", client: "a", now: 1000, limiter });
    for (let i = 0; i < DEMO_LIMITS.query.limit; i++) expect(q()).toEqual({ action: "allow" });
    expect(q()).toMatchObject({ action: "rate-limited" });
    // a different visitor is not affected
    expect(decideDemoRequest({ method: "POST", pathname: "/api/query", client: "b", now: 1000, limiter })).toEqual({ action: "allow" });
    // reading the wiki is a separate bucket for the same visitor
    expect(decideDemoRequest({ method: "GET", pathname: "/api/pages", client: "a", now: 1000, limiter })).toEqual({ action: "allow" });
  });

  it("never throttles the health check", () => {
    const limiter = new FixedWindowLimiter();
    for (let i = 0; i < 1000; i++) {
      expect(decideDemoRequest({ method: "GET", pathname: "/api/health", client: "a", now: 5, limiter })).toEqual({ action: "allow" });
    }
  });
});

describe("FixedWindowLimiter", () => {
  const rule = { limit: 3, windowMs: 1000 };

  it("allows up to the limit, then reports a retry delay, then resets with the next window", () => {
    const l = new FixedWindowLimiter();
    expect([0, 1, 2].map((i) => l.hit("k", rule, 100 + i).allowed)).toEqual([true, true, true]);
    const blocked = l.hit("k", rule, 500);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(l.hit("k", rule, 1100).allowed).toBe(true); // window of 1000 ms has passed
  });

  it("keeps clients separate", () => {
    const l = new FixedWindowLimiter();
    for (let i = 0; i < 3; i++) l.hit("a", rule, 0);
    expect(l.hit("a", rule, 1).allowed).toBe(false);
    expect(l.hit("b", rule, 1).allowed).toBe(true);
  });

  it("cannot grow without bound when many different clients appear", () => {
    const l = new FixedWindowLimiter(50);
    for (let i = 0; i < 500; i++) l.hit(`client-${i}`, rule, 0);
    // internal size is private; the table must have been cleared at least once, so an old key starts fresh
    expect(l.hit("client-0", rule, 1).allowed).toBe(true);
    expect((l as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(50);
  });
});

describe("clientKey and isDemoMode", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

  it("uses the first X-Forwarded-For address, then X-Real-IP, then one shared bucket", () => {
    expect(clientKey(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientKey(h({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientKey(h({}))).toBe("unknown");
  });

  it("is on only for the exact value 1", () => {
    expect(isDemoMode({ EVIDENCEGRAPH_DEMO: "1" })).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", "on"]) expect(isDemoMode({ EVIDENCEGRAPH_DEMO: v })).toBe(false);
  });
});
