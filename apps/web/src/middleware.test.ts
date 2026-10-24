import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as health } from "./app/api/health/route";
import { middleware } from "./middleware";

// The real middleware function, called with real NextRequest objects. Each test uses its own client address so the
// middleware's in-memory rate limiter (one per server process) does not leak between tests.
let n = 0;
const req = (method: string, path: string, ip = `10.1.0.${++n}`) =>
  new NextRequest(`http://localhost:3000${path}`, { method, headers: { "x-forwarded-for": ip } });

const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("outside demo mode the middleware changes nothing", () => {
  it("passes every request through, including writes and the blocked screens", () => {
    for (const [m, p] of [["POST", "/api/ingest"], ["PUT", "/api/settings"], ["GET", "/settings"], ["POST", "/api/wikis"], ["GET", "/api/wikis/export"]]) {
      expect(passedThrough(middleware(req(m!, p!))), `${m} ${p}`).toBe(true);
    }
  });
});

describe("in demo mode (EVIDENCEGRAPH_DEMO=1)", () => {
  const demo = () => vi.stubEnv("EVIDENCEGRAPH_DEMO", "1");

  it("refuses writes, configuration, workspace changes and export with a JSON 403", async () => {
    demo();
    for (const [m, p] of [
      ["POST", "/api/ingest"], ["POST", "/api/ingest/apply"], ["PUT", "/api/settings"], ["POST", "/api/config"],
      ["DELETE", "/api/config"], ["POST", "/api/wikis"], ["GET", "/api/wikis/export"], ["PUT", "/api/pages/x"],
      ["POST", "/api/pages"], ["POST", "/api/pages/x/delete"], ["PUT", "/api/schema"], ["POST", "/api/contradictions"],
      ["POST", "/api/chats/abc/messages"], ["POST", "/api/lint"], ["POST", "/api/onboarding"], ["POST", "/api/config/test"],
    ] as const) {
      const res = middleware(req(m, p));
      expect(res.status, `${m} ${p}`).toBe(403);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toMatchObject({ ok: false });
    }
  });

  it("lets a visitor read the wiki and ask a question", () => {
    demo();
    for (const [m, p] of [["GET", "/"], ["GET", "/wiki/cell-aging"], ["GET", "/api/pages"], ["GET", "/api/contradictions"], ["POST", "/api/query"], ["GET", "/api/health"]] as const) {
      expect(passedThrough(middleware(req(m, p))), `${m} ${p}`).toBe(true);
    }
  });

  it("shows a notice page instead of Settings, Dashboard, Chats and Local models", () => {
    demo();
    for (const p of ["/settings", "/dashboard", "/chats", "/chats/1", "/local-models"]) {
      const res = middleware(req("GET", p));
      expect(res.headers.get("x-middleware-rewrite"), p).toContain("/demo-disabled");
    }
  });

  it("answers 429 with Retry-After once a visitor asks too many questions, and spares other visitors", async () => {
    demo();
    const ip = "203.0.113.50";
    for (let i = 0; i < 8; i++) expect(passedThrough(middleware(req("POST", "/api/query", ip)))).toBe(true);
    const blocked = middleware(req("POST", "/api/query", ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(await blocked.json()).toMatchObject({ ok: false });
    expect(passedThrough(middleware(req("POST", "/api/query", "203.0.113.51")))).toBe(true);
  });
});

describe("GET /api/health", () => {
  it("reports the mode and nothing else", async () => {
    expect(await health().json()).toEqual({ ok: true, mode: "normal" });
    vi.stubEnv("EVIDENCEGRAPH_DEMO", "1");
    expect(await health().json()).toEqual({ ok: true, mode: "demo" });
  });
});
