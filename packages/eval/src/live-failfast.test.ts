import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmClient } from "@evidencegraph/llm";

import { formatLiveMarkdown, runLiveEval } from "./live";

const KEY = "sk-or-v1-NOTAREALKEY0123456789abcdef";

function sdkError(status: number, headers: Headers, body?: unknown) {
  return Object.assign(new Error(`${status} ${KEY} should never be shown`), { status, headers, error: body });
}

function failingClient(error: Error) {
  const create = vi.fn(async () => {
    throw error;
  });
  const client = { baseURL: "https://openrouter.ai/api/v1", chat: { completions: { create } } } as unknown as LlmClient;
  return { client, create };
}

beforeEach(() => {
  process.env["OPENROUTER_API_KEY"] = KEY;
});
afterEach(() => {
  delete process.env["OPENROUTER_API_KEY"];
});

// callLLM waits 1 s and 2 s between its own attempts when it sees an unrecognised LlmError,
// so these tests legitimately take about 3 s each.
describe("fail fast on a rate limit", () => {
  const rateLimit = sdkError(
    429,
    new Headers({ "retry-after": "60", "x-ratelimit-limit": "20", "x-ratelimit-remaining": "0" }),
    { message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded", provider_code: "rate_limited" } },
  );

  it("sends exactly one request, stops, runs no further questions, and records what the provider said", async () => {
    const { client, create } = failingClient(rateLimit);
    const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 5, client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(report.requestsSent).toBe(1);
    expect(report.rows).toHaveLength(1);
    expect(report.questions).toBe(5);
    expect(report.stoppedEarly).toEqual({ reason: "rate_limited", afterQuestion: "q01", questionsNotRun: 4 });

    const row = report.rows[0];
    expect(row?.error).toBe("RateLimitError");
    expect(row?.errorDetails).toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
      platformRateLimitHeaders: true,
      errorType: "rate_limit_exceeded",
      providerCode: "rate_limited",
    });
  }, 20_000);

  it("never leaks the key or the raw SDK message into the report or its markdown", async () => {
    const { client } = failingClient(rateLimit);
    const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 5, client });
    expect(JSON.stringify(report)).not.toContain(KEY);
    expect(formatLiveMarkdown(report)).not.toContain(KEY);
    expect(formatLiveMarkdown(report)).not.toContain("should never be shown");
  }, 20_000);

  it("explains the stop in the markdown, with the documented hint about who limited the request", async () => {
    const { client } = failingClient(rateLimit);
    const md = formatLiveMarkdown(await runLiveEval({ provider: "openrouter", model: "m", limit: 5, client }));
    expect(md).toMatch(/stopped after the first rate-limit/i);
    expect(md).toMatch(/4 of 5 questions were not run/i);
    expect(md).toMatch(/Retry-After: 60/);
    expect(md).toMatch(/X-RateLimit/);
    expect(md).toMatch(/OpenRouter's own limit/);
  }, 20_000);

  it("describes an upstream-style 429 differently from a platform one", async () => {
    const upstream = sdkError(429, new Headers(), { message: "Provider returned error", metadata: { provider_name: "SomeProvider", provider_code: 429 } });
    const { client } = failingClient(upstream);
    const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 2, client });
    expect(report.rows[0]?.errorDetails?.platformRateLimitHeaders).toBe(false);
    expect(formatLiveMarkdown(report)).toMatch(/upstream provider/i);
  }, 20_000);
});

describe("fail fast on insufficient credits", () => {
  it("stops after the first 402 with its own reason", async () => {
    const { client, create } = failingClient(sdkError(402, new Headers(), { message: "Insufficient credits" }));
    const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 5, client });
    expect(create).toHaveBeenCalledTimes(1);
    expect(report.stoppedEarly?.reason).toBe("insufficient_credits");
    expect(report.rows[0]?.error).toBe("InsufficientCreditsError");
    expect(formatLiveMarkdown(report)).toMatch(/insufficient credits/i);
  }, 20_000);
});

describe("other failures do not stop the run", () => {
  it("records the details of a 404 for each question and carries on", async () => {
    const { client, create } = failingClient(sdkError(404, new Headers(), { message: "No endpoints found" }));
    const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 2, client });
    expect(report.stoppedEarly).toBeNull();
    expect(report.rows).toHaveLength(2);
    expect(report.rows.every((r) => r.error === "UnknownModelError")).toBe(true);
    expect(report.rows[0]?.errorDetails).toMatchObject({ status: 404, message: "No endpoints found" });
    expect(create).toHaveBeenCalledTimes(2); // one request per question: the 404 is not retried
    expect(report.requestsSent).toBe(2);
  }, 20_000);
});
