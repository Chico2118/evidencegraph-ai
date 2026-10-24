// `pnpm demo` — seed a throwaway wiki from the synthetic fixtures, start a
// mock model server, and launch the app against both. No API key, no network,
// no cost, and it never touches your real wiki or ~/.llm-wiki config.
//
//   pnpm demo                       faithful mock model
//   pnpm demo -- --mode flawed      mock model that also makes bad citations
//   pnpm demo -- --seed-only        only create the demo wiki (prints env to use)
//   pnpm demo -- --dir <folder>     where to put the demo wiki
//
// The mock is NOT a language model; see mock-llm.ts.

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WIKI_SETTINGS,
  initWikiFolder,
  openDb,
  saveGlobalConfig,
  saveWikiSettings,
  syncWikiToDb,
  DEFAULT_GLOBAL_CONFIG,
} from "@evidencegraph/core";

import { assertSafeToReseed, DEMO_MARKER, DEMO_MARKER_TEXT } from "./demo-guard";
import { loadFixtures } from "./fixtures";
import type { MockMode } from "./mock-llm";
import { startMockServer } from "./mock-server";
import { seedWikiFromFixtures } from "./seed";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function seedDemoWiki(wikiPath: string): Promise<void> {
  const fixtures = loadFixtures();
  await assertSafeToReseed(wikiPath); // never delete a folder that is not clearly a demo wiki
  await rm(wikiPath, { recursive: true, force: true });
  await initWikiFolder(wikiPath); // settings.json needs the folder first
  await writeFile(join(wikiPath, DEMO_MARKER), DEMO_MARKER_TEXT, "utf8");

  const model = { provider: "ollama" as const, model: "mock-evidence-model" };
  await saveWikiSettings(wikiPath, {
    ...DEFAULT_WIKI_SETTINGS,
    topic: "Battery research notes (synthetic demo data)",
    defaultModels: { ingest: model, query: model, chat: model, lint: model, vision: model },
  });

  const db = openDb(wikiPath);
  try {
    await seedWikiFromFixtures(wikiPath, db, fixtures);
    await syncWikiToDb(wikiPath, db);
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (flag(args, "--mode") ?? "faithful") as MockMode;
  const dir = resolve(flag(args, "--dir") ?? join(tmpdir(), "evidencegraph-demo"));
  const configDir = join(dir, "..", `${dir.split(/[\\/]/).pop()}-config`);
  const mockPort = Number(flag(args, "--mock-port") ?? 11999);

  await seedDemoWiki(dir);
  await mkdir(configDir, { recursive: true });
  process.env["LLM_WIKI_CONFIG_DIR"] = configDir;
  await saveGlobalConfig({ ...DEFAULT_GLOBAL_CONFIG, activeWiki: dir, onboardingCompletedAt: new Date().toISOString() });

  console.log(`Demo wiki:   ${dir}`);
  console.log(`Config dir:  ${configDir} (your real ~/.llm-wiki is untouched)`);
  if (args.includes("--seed-only")) return;

  const mock = await startMockServer(mockPort, mode);
  console.log(`Mock model:  http://127.0.0.1:${mockPort} (${mode}) — a stand-in, not a language model`);

  const env = {
    ...process.env,
    EVIDENCEGRAPH_PATH: dir,
    LLM_WIKI_CONFIG_DIR: configDir,
    OLLAMA_BASE_URL: `http://127.0.0.1:${mockPort}`,
  };
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, ["--filter", "@evidencegraph/web", "dev"], { cwd: REPO_ROOT, env, stdio: "inherit", shell: process.platform === "win32" });
  const stop = () => {
    mock.close();
    child.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => {
    mock.close();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
