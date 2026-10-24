import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callLLM, headerValue, type LlmClient } from "./client";

// The installed OpenAI SDK (v6) exposes error.headers as a web `Headers` object.
// Older code and the existing tests used plain objects. Both must work.

async function firstRetryDelay(headers: unknown): Promise<number | undefined> {
  const create = vi.fn(async () => {
    throw Object.assign(new Error("429 rate limited"), { status: 429, headers });
  });
  const client = { chat: { completions: { create } }, baseURL: "https://openrouter.ai/api/v1" } as unknown as LlmClient;
  const controller = new AbortController();
  let delay: number | undefined;
  await callLLM({
    client,
    model: "m",
    system: "s",
    user: "u",
    schema: z.object({}),
    signal: controller.signal,
    // Capture the delay the retry loop chose, then abort so the test never actually waits.
    // The abort must land AFTER the loop starts sleeping (sleep only listens during the wait).
    onRetry: (_attempt, delayMs) => {
      delay = delayMs;
      setTimeout(() => controller.abort(), 5);
    },
  }).catch(() => undefined);
  return delay;
}

describe("headerValue", () => {
  it("reads web Headers (any case) and plain objects, and tolerates junk", () => {
    expect(headerValue(new Headers({ "Retry-After": "30" }), "retry-after")).toBe("30");
    expect(headerValue({ "retry-after": "7" }, "retry-after")).toBe("7");
    expect(headerValue({ "Retry-After": "9" }, "retry-after")).toBe("9");
    expect(headerValue(undefined, "retry-after")).toBeUndefined();
    expect(headerValue(null, "retry-after")).toBeUndefined();
    expect(headerValue("not headers", "retry-after")).toBeUndefined();
    expect(headerValue({ "retry-after": 5 }, "retry-after")).toBeUndefined(); // only strings
  });
});

describe("callLLM honours Retry-After on a 429", () => {
  it("uses the server's wait from a web Headers object (the SDK's real shape)", async () => {
    expect(await firstRetryDelay(new Headers({ "retry-after": "7" }))).toBe(7000);
  });

  it("still works with plain-object headers", async () => {
    expect(await firstRetryDelay({ "retry-after": "3" })).toBe(3000);
  });

  it("accepts Retry-After: 0", async () => {
    expect(await firstRetryDelay(new Headers({ "retry-after": "0" }))).toBe(0);
  });

  it("caps an enormous wait so a stray header cannot hang the app", async () => {
    expect(await firstRetryDelay(new Headers({ "retry-after": "3600" }))).toBe(60_000);
  });

  it("falls back to exponential backoff when the header is missing or unusable", async () => {
    expect(await firstRetryDelay(new Headers())).toBe(1000);
    expect(await firstRetryDelay(new Headers({ "retry-after": "soon" }))).toBe(1000);
    expect(await firstRetryDelay(undefined)).toBe(1000);
  });
});
