import { mockQueryResponse } from "@evidencegraph/eval";
import type { LlmClient } from "@evidencegraph/llm";

// A model client for the public demo that never leaves the process: it answers with the deterministic mock
// from the evaluation package (it quotes the best-matching retrieved passage; see packages/eval/src/mock-llm.ts).
// It is NOT a language model, and the demo banner says so. No network, no API key, no cost.

export const DEMO_MODEL = "mock-evidence-model";

type Message = { role: string; content: unknown };

export function createDemoClient(): LlmClient {
  const create = async (params: { messages?: Message[] }) => {
    const text = (role: string) => String(params.messages?.find((m) => m.role === role)?.content ?? "");
    const payload = mockQueryResponse(text("system"), text("user"), "faithful");
    return {
      id: "demo-mock",
      model: DEMO_MODEL,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  };
  // Only chat.completions.create is ever called by the query pipeline; cast at this one boundary.
  return { baseURL: "demo://mock", chat: { completions: { create } } } as unknown as LlmClient;
}
