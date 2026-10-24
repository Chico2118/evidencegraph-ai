// Usage:
//   pnpm eval                 run the deterministic suite, print + write results/latest.*
//   pnpm eval --check         run it and fail (exit 1) if results/latest.json differs
//   pnpm eval --live ...      run the live-model suite (needs a provider; see docs/evaluation.md)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runDeterministicEval } from "./deterministic";
import { loadHeldoutFixtures } from "./fixtures";
import type { MockMode } from "./mock-llm";
import { serverPort, startMockServer } from "./mock-server";
import { runLiveEval, formatLiveMarkdown } from "./live";
import { formatReportMarkdown } from "./report";

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "results");

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--live")) {
    const mockIdx = args.indexOf("--mock");
    const useMock = mockIdx >= 0;
    const mockMode = (args[mockIdx + 1] === "flawed" ? "flawed" : "faithful") as MockMode;
    let mockServer: Awaited<ReturnType<typeof startMockServer>> | null = null;
    if (useMock) {
      // Point the ollama provider at an in-process mock; nothing leaves the machine.
      mockServer = await startMockServer(0, mockMode);
      process.env["OLLAMA_BASE_URL"] = `http://127.0.0.1:${serverPort(mockServer)}`;
    }
    const provider = (useMock ? "ollama" : (flag(args, "--provider") ?? "openrouter")) as "openrouter" | "ollama";
    const model = useMock ? `mock-${mockMode}` : flag(args, "--model");
    if (!model) throw new Error("--live requires --model <model-slug> (or --mock)");
    const limit = flag(args, "--limit");
    let report;
    try {
      report = await runLiveEval({ provider, model, limit: limit ? Number(limit) : undefined, mock: useMock });
    } finally {
      mockServer?.close();
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await mkdir(RESULTS_DIR, { recursive: true });
    const base = join(RESULTS_DIR, `live-${model.replace(/[^a-z0-9.-]+/gi, "_")}-${stamp}`);
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + "\n", "utf8");
    await writeFile(`${base}.md`, formatLiveMarkdown(report), "utf8");
    console.log(formatLiveMarkdown(report));
    console.log(`\nWrote ${base}.json`);
    return;
  }

  const heldout = args.includes("--heldout");
  const report = heldout ? runDeterministicEval(loadHeldoutFixtures()) : runDeterministicEval();
  const json = JSON.stringify(report, null, 2) + "\n";
  const md = heldout
    ? formatReportMarkdown(report, "EvidenceGraph AI — HELD-OUT evaluation (current code)")
    : formatReportMarkdown(report);
  const stem = heldout ? "heldout-latest" : "latest";

  if (args.includes("--check")) {
    let committed = "";
    try {
      committed = await readFile(join(RESULTS_DIR, `${stem}.json`), "utf8");
    } catch {
      console.error("No committed results/" + stem + ".json to compare with. Run: pnpm eval" + (heldout ? " --heldout" : ""));
      process.exit(1);
    }
    if (committed !== json) {
      console.error("Evaluation results differ from results/" + stem + ".json. If the change is intended, rerun: pnpm eval" + (heldout ? " --heldout" : "") + " and commit the new files.");
      process.exit(1);
    }
    console.log(`Evaluation results match results/${stem}.json.`);
    return;
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, `${stem}.json`), json, "utf8");
  await writeFile(join(RESULTS_DIR, `${stem}.md`), md, "utf8");
  console.log(md);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
