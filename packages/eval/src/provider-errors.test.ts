import { describe, expect, it, vi } from "vitest";

import { createClient, type LlmClient } from "@evidencegraph/llm";

import { createLiveClient, describeProviderError, guardClient, StopRunError } from "./provider-errors";

const KEY = "sk-or-v1-NOTAREALKEY0123456789abcdef";

/** An error shaped like the one the OpenAI SDK (v6) throws. */
function sdkError(status: number, opts: { headers?: unknown; body?: unknown } = {}) {
  return Object.assign(new Error(`${status} provider error`), {
    status,
    headers: opts.headers ?? new Headers(),
    error: opts.body,
  });
}

describe("describeProviderError", () => {
  it("extracts non-secret facts from an OpenRouter platform 429", () => {
    const d = describeProviderError(
      sdkError(429, {
        headers: new Headers({
          "retry-after": "60",
          "x-ratelimit-limit": "20",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1730000000000",
        }),
        body: { message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded", provider_code: "rate_limited" } },
      }),
      KEY,
    );
    expect(d).toEqual({
      status: 429,
      retryAfterSeconds: 60,
      platformRateLimitHeaders: true,
      rateLimitHeaders: { limit: "20", remaining: "0", reset: "1730000000000" },
      errorType: "rate_limit_exceeded",
      providerCode: "rate_limited",
      providerName: null,
      message: "Rate limit exceeded",
    });
  });

  it("describes an upstream-provider 429: no platform headers, provider named", () => {
    const d = describeProviderError(
      sdkError(429, { body: { message: "Provider returned error", metadata: { provider_name: "Some Provider", provider_code: 429 } } }),
      KEY,
    );
    expect(d?.platformRateLimitHeaders).toBe(false);
    expect(d?.providerName).toBe("Some Provider");
    expect(d?.providerCode).toBe("429"); // numbers are normalised to strings
    expect(d?.retryAfterSeconds).toBeNull();
  });

  it("reads plain-object headers too", () => {
    const d = describeProviderError(sdkError(429, { headers: { "Retry-After": "5", "X-RateLimit-Remaining": "3" } }), KEY);
    expect(d?.retryAfterSeconds).toBe(5);
    expect(d?.platformRateLimitHeaders).toBe(true);
    expect(d?.rateLimitHeaders.remaining).toBe("3");
  });

  it("never carries the key, key-shaped text, or the provider's raw payload", () => {
    const d = describeProviderError(
      sdkError(402, {
        body: {
          message: `Insufficient credits for key ${KEY} and also sk-ant-abcdef123456`,
          metadata: { provider_name: `P ${KEY}`, raw: "SECRET-RAW-PAYLOAD ".repeat(50), user_id: "user_123" },
        },
      }),
      KEY,
    );
    const text = JSON.stringify(d);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("sk-ant-");
    expect(text).not.toContain("SECRET-RAW-PAYLOAD");
    expect(text).not.toContain("user_123");
    expect(text).toContain("[redacted]");
  });

  it("truncates long fields", () => {
    const d = describeProviderError(sdkError(429, { body: { message: "x".repeat(1000), metadata: { error_type: "y".repeat(500) } } }), KEY);
    expect((d?.message ?? "").length).toBeLessThanOrEqual(160);
    expect((d?.errorType ?? "").length).toBeLessThanOrEqual(80);
  });

  it("returns null for things that are not HTTP errors", () => {
    expect(describeProviderError(new Error("boom"), KEY)).toBeNull();
    expect(describeProviderError(null, KEY)).toBeNull();
    expect(describeProviderError("429", KEY)).toBeNull();
    expect(describeProviderError({ status: "429" }, KEY)).toBeNull();
  });
});

describe("guardClient", () => {
  function client(create: (...args: unknown[]) => Promise<unknown>) {
    return { baseURL: "https://openrouter.ai/api/v1", chat: { completions: { create } } } as unknown as LlmClient;
  }

  it("passes successes through and counts requests", async () => {
    const create = vi.fn(async () => ({ ok: true }));
    const g = guardClient(client(create), KEY);
    await expect(g.client.chat.completions.create({} as never)).resolves.toEqual({ ok: true });
    await g.client.chat.completions.create({} as never);
    expect(g.stats.requests).toBe(2);
    expect(g.client.baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("trips on the first 429 and sends NO further request, however often it is called", async () => {
    const create = vi.fn(async () => {
      throw sdkError(429, { headers: new Headers({ "retry-after": "60" }) });
    });
    const g = guardClient(client(create), KEY);
    const first = await g.client.chat.completions.create({} as never).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(StopRunError);
    expect((first as StopRunError).reason).toBe("rate_limited");
    expect((first as StopRunError).details.retryAfterSeconds).toBe(60);
    await g.client.chat.completions.create({} as never).catch(() => undefined);
    await g.client.chat.completions.create({} as never).catch(() => undefined);
    expect(create).toHaveBeenCalledTimes(1);
    expect(g.stats.requests).toBe(1);
  });

  it("trips on a 402 as well, with a different reason", async () => {
    const create = vi.fn(async () => {
      throw sdkError(402);
    });
    const g = guardClient(client(create), KEY);
    const err = (await g.client.chat.completions.create({} as never).catch((e: unknown) => e)) as StopRunError;
    expect(err).toBeInstanceOf(StopRunError);
    expect(err.reason).toBe("insufficient_credits");
    expect(err.message).not.toContain(KEY);
  });

  it("does not trip on other errors, which pass through untouched", async () => {
    const boom = sdkError(500);
    const create = vi.fn().mockRejectedValueOnce(boom).mockResolvedValueOnce({ ok: 1 });
    const g = guardClient(client(create), KEY);
    await expect(g.client.chat.completions.create({} as never)).rejects.toBe(boom);
    expect(g.stats.lastError?.status).toBe(500); // remembered, so the runner can report it
    await expect(g.client.chat.completions.create({} as never)).resolves.toEqual({ ok: 1 });
    expect(g.stats.requests).toBe(2);
  });
});

describe("createLiveClient", () => {
  it("disables the SDK's hidden retries for the live run only", () => {
    expect(createLiveClient("k-for-test", "openrouter").maxRetries).toBe(0);
    // The app's own client is deliberately unchanged.
    expect(createClient("k-for-test", "openrouter").maxRetries).toBe(2);
  });
});
