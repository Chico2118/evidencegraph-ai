import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callLLM, chatComplete, type LlmClient } from "./client";
import { AuthenticationError } from "./errors";

// A fake "key" that must never appear in anything we surface.
const FAKE_SECRET = "sk-or-v1-NOTAREALKEY0123456789abcdef";

function failingClient(status: number): { client: LlmClient; calls: () => number } {
  const create = vi.fn(async () => {
    const err = new Error(`${status} Incorrect API key provided: ${FAKE_SECRET}`) as Error & { status: number };
    err.status = status;
    throw err;
  });
  return { client: { chat: { completions: { create } }, baseURL: "https://openrouter.ai/api/v1" } as unknown as LlmClient, calls: () => create.mock.calls.length };
}

describe("authentication failures", () => {
  it.each([401, 403])("callLLM: HTTP %i is a distinct error, not retried, and never echoes the key", async (status) => {
    const { client, calls } = failingClient(status);
    const err = await callLLM({ client, model: "m", system: "s", user: "u", schema: z.object({}) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(calls()).toBe(1); // no retries on a bad key
    expect(String((err as Error).message)).not.toContain(FAKE_SECRET);
    expect(String((err as Error).message)).not.toContain("sk-or-");
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain(FAKE_SECRET);
  });

  it("chatComplete behaves the same way", async () => {
    const { client, calls } = failingClient(401);
    const err = await chatComplete({ client, model: "m", messages: [{ role: "user", content: "hi" }] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(calls()).toBe(1);
    expect(String((err as Error).message)).not.toContain(FAKE_SECRET);
  });

  it("the message tells the user what to check", async () => {
    const { client } = failingClient(401);
    const err = (await callLLM({ client, model: "m", system: "s", user: "u", schema: z.object({}) }).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/authentication failed/i);
    expect(err.message).toMatch(/API key/i);
  });
});
