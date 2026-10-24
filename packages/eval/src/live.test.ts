import { describe, expect, it, vi } from "vitest";

import type { LlmClient } from "@evidencegraph/llm";

import { loadFixtures } from "./fixtures";
import { redactSecrets, runLiveEval, selectQuestions } from "./live";

describe("selectQuestions", () => {
  const all = loadFixtures().questions;

  it("returns everything when there is no limit", () => {
    expect(selectQuestions(all, undefined)).toHaveLength(all.length);
  });

  it("a small limit still covers missing-evidence questions (the fixture lists unanswerable ones last)", () => {
    const five = selectQuestions(all, 5);
    expect(five).toHaveLength(5);
    expect(five.some((q) => !q.answerable)).toBe(true);
    expect(five.some((q) => q.id === "q01")).toBe(true); // the contradictory-sources question
  });

  it("keeps the original order and never returns more than asked for", () => {
    for (const n of [1, 2, 3, 5, 8, 20, 99]) {
      const picked = selectQuestions(all, n);
      expect(picked.length).toBe(Math.min(n, all.length));
      const idx = picked.map((q) => all.findIndex((a) => a.id === q.id));
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });

  it("limit 1 is a single answerable question; limit 0 or negative is rejected", () => {
    expect(selectQuestions(all, 1).map((q) => q.answerable)).toEqual([true]);
    expect(() => selectQuestions(all, 0)).toThrow(/positive/);
    expect(() => selectQuestions(all, -3)).toThrow(/positive/);
  });
});

describe("redactSecrets", () => {
  it("removes the configured key and anything shaped like one", () => {
    const key = "super-secret-token-value-123";
    const out = redactSecrets(`401 bad key ${key} / also sk-or-v1-abcdef123456 and sk-ant-xyz987654`, key);
    expect(out).not.toContain(key);
    expect(out).not.toContain("sk-or-v1-abcdef123456");
    expect(out).not.toContain("sk-ant-xyz987654");
    expect(out).toContain("[redacted]");
  });

  it("truncates long messages and tolerates an empty key", () => {
    expect(redactSecrets("x".repeat(1000), "").length).toBeLessThanOrEqual(300);
    expect(redactSecrets("plain", "")).toBe("plain");
  });
});

describe("runLiveEval safety", () => {
  const FAKE = "sk-or-v1-NOTAREALKEY0123456789abcdef";

  function clientThatRejects(status: number) {
    const create = vi.fn(async () => {
      const err = new Error(`${status} Incorrect API key provided: ${FAKE}`) as Error & { status: number };
      err.status = status;
      throw err;
    });
    return { client: { chat: { completions: { create } }, baseURL: "https://openrouter.ai/api/v1" } as unknown as LlmClient, create };
  }

  it("stops at the first authentication failure instead of retrying every question, and leaks nothing", async () => {
    const { client, create } = clientThatRejects(401);
    process.env["OPENROUTER_API_KEY"] = FAKE;
    try {
      const err = await runLiveEval({ provider: "openrouter", model: "m", limit: 5, client }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/authentication failed/i);
      expect((err as Error).message).not.toContain(FAKE);
      expect(create).toHaveBeenCalledTimes(1); // one request, no retries, no further questions
    } finally {
      delete process.env["OPENROUTER_API_KEY"];
    }
  });

  it("refuses to start without a key (no request is made)", async () => {
    delete process.env["OPENROUTER_API_KEY"];
    await expect(runLiveEval({ provider: "openrouter", model: "m", limit: 1 })).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
  });

  it("records other failures per question with a redacted message, and keeps going", async () => {
    const create = vi.fn(async () => ({
      id: "x",
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content: "this is not json at all" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const client = { chat: { completions: { create } }, baseURL: "https://openrouter.ai/api/v1" } as unknown as LlmClient;
    process.env["OPENROUTER_API_KEY"] = FAKE;
    try {
      const report = await runLiveEval({ provider: "openrouter", model: "m", limit: 2, client });
      expect(report.rows).toHaveLength(2);
      expect(report.rows.every((r) => r.error === "InvalidJsonError")).toBe(true);
      expect(report.rows[0]?.errorMessage).toBeTruthy();
      expect(report.metrics.failedRuns.value).toBe(1);
      expect(JSON.stringify(report)).not.toContain(FAKE);
    } finally {
      delete process.env["OPENROUTER_API_KEY"];
    }
  });
});
