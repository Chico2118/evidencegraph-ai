// Local history of research runs (question + the model's structured answer).
//
// Stored as one JSON file in the wiki's tooling folder, consistent with the
// project's "everything is a file" rule. Only the *model response* is kept,
// never a verdict: when a run is reopened, evidence is verified again
// against the wiki as it is now, so a page that was edited or deleted since
// then shows up honestly instead of replaying a stale "verified".

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { QueryResponseSchema, type QueryResponse } from "./schema";
import { WIKI_PATHS } from "./wiki";

export const RESEARCH_HISTORY_FILE = "research-history.json";
const MAX_RUNS = 100;

const RunSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string(),
  model: z.string(),
  createdAt: z.string(),
  response: QueryResponseSchema,
});

const FileSchema = z.object({ version: z.literal(1), runs: z.array(z.unknown()) });

export type ResearchRun = z.infer<typeof RunSchema>;

function historyPath(wikiPath: string): string {
  return join(wikiPath, WIKI_PATHS.tooling, RESEARCH_HISTORY_FILE);
}

/** Reads the file defensively: a corrupt file or entry is skipped, never thrown. */
export async function listResearchRuns(wikiPath: string, limit = MAX_RUNS): Promise<ResearchRun[]> {
  let raw: string;
  try {
    raw = await readFile(historyPath(wikiPath), "utf8");
  } catch {
    return [];
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }
  const file = FileSchema.safeParse(parsedJson);
  if (!file.success) return [];
  const runs: ResearchRun[] = [];
  for (const entry of file.data.runs) {
    const run = RunSchema.safeParse(entry);
    if (run.success) runs.push(run.data);
  }
  return runs.slice(0, limit);
}

export async function getResearchRun(wikiPath: string, id: string): Promise<ResearchRun | null> {
  const runs = await listResearchRuns(wikiPath);
  return runs.find((r) => r.id === id) ?? null;
}

export async function appendResearchRun(
  wikiPath: string,
  input: { question: string; model: string; response: QueryResponse },
): Promise<ResearchRun> {
  const run: ResearchRun = {
    id: randomUUID(),
    question: input.question.trim(),
    model: input.model,
    createdAt: new Date().toISOString(),
    response: input.response,
  };
  const existing = await listResearchRuns(wikiPath);
  const next = [run, ...existing].slice(0, MAX_RUNS);

  const dir = join(wikiPath, WIKI_PATHS.tooling);
  await mkdir(dir, { recursive: true });
  // Write-then-rename so a crash mid-write cannot leave a half-written file.
  const tmp = join(dir, `${RESEARCH_HISTORY_FILE}.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify({ version: 1, runs: next }, null, 2), "utf8");
  await rename(tmp, historyPath(wikiPath));
  return run;
}
