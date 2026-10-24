// A tiny OpenAI-compatible server backed by mock-llm.ts. Used by `pnpm demo`
// and `pnpm eval --live --mock`. It is a stand-in, NOT a language model.

import { createServer, type Server } from "node:http";

import { mockQueryResponse, type MockMode } from "./mock-llm";

export function startMockServer(port: number, mode: MockMode): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const body = JSON.parse(raw) as { messages?: Array<{ role: string; content: unknown }> };
        const text = (role: string) => String(body.messages?.find((m) => m.role === role)?.content ?? "");
        const payload = mockQueryResponse(text("system"), text("user"), mode);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "mock",
            model: "mock-evidence-model",
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }],
            usage: { prompt_tokens: 1200, completion_tokens: 200 },
          }),
        );
      } catch {
        res.writeHead(400).end();
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // port 0 = let the OS pick a free one; read it back from server.address().
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export function serverPort(server: Server): number {
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("mock server has no port");
  return addr.port;
}
