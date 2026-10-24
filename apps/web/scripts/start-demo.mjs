#!/usr/bin/env node
// Starts the READ-ONLY PUBLIC DEMO from a finished production build.
//
//   pnpm build && pnpm demo:seed && pnpm start:demo
//
// It serves only synthetic data (apps/web/demo-data, built by `pnpm demo:seed`), answers questions with the
// built-in mock, and has no API key: any key in the environment is removed before the server starts.
// It never touches your real wiki or ~/.llm-wiki.
//
// Environment: PORT (default 3000). EVIDENCEGRAPH_DEMO_HOST (default 127.0.0.1; a hosting platform that
// puts a proxy in front needs 0.0.0.0).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wiki = join(web, "demo-data", "wiki");
const config = join(web, "demo-data", "wiki-config");
const server = join(web, ".next", "standalone", "apps", "web", "server.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(server)) fail("No production build found. Run `pnpm build` first.");
if (!existsSync(join(wiki, "index.md"))) fail("No demo wiki found. Run `pnpm demo:seed` first.");

const env = {
  ...process.env,
  EVIDENCEGRAPH_DEMO: "1",
  EVIDENCEGRAPH_PATH: wiki,
  LLM_WIKI_CONFIG_DIR: config,
  PORT: process.env["PORT"] ?? "3000",
  HOSTNAME: process.env["EVIDENCEGRAPH_DEMO_HOST"] ?? "127.0.0.1",
};
// The demo has no model access at all.
delete env["OPENROUTER_API_KEY"];
delete env["EVIDENCEGRAPH_OPENROUTER_API_KEY"];
delete env["OLLAMA_BASE_URL"];

console.log(`EvidenceGraph AI read-only demo on http://${env.HOSTNAME}:${env.PORT}`);
const child = spawn(process.execPath, [server], { cwd: web, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
