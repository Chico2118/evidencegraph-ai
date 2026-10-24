// `pnpm demo` rebuilds its wiki from scratch on every start, which means deleting the folder first. That is only
// acceptable for a folder that is clearly a demo wiki: a mistyped --dir must never wipe someone's real wiki.

import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

/** Written into every demo wiki the first time it is seeded. A folder that has it may be re-seeded. */
export const DEMO_MARKER = ".evidencegraph-demo";

export const DEMO_MARKER_TEXT =
  "This folder is a disposable demo wiki made by `pnpm demo` / `pnpm demo:seed`. It is deleted and rebuilt on every start. Do not keep real data here.\n";

/**
 * Throws unless `dir` is missing, empty, carries the demo marker, or is the default throwaway location
 * (a folder named evidencegraph-demo* inside the OS temp directory, which earlier demos created without a marker).
 */
export async function assertSafeToReseed(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return; // does not exist yet
  }
  if (entries.length === 0 || entries.includes(DEMO_MARKER)) return;

  const resolved = resolve(dir);
  const same = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
  // The folder must sit DIRECTLY in the temp directory: a demo-looking name somewhere else proves nothing.
  if (same(dirname(resolved), resolve(tmpdir())) && basename(resolved).startsWith("evidencegraph-demo")) return;

  throw new Error(
    `Refusing to delete ${resolved}: it already has files and is not marked as a demo wiki (no ${DEMO_MARKER} file). ` +
      `Pick an empty or new folder for --dir, or remove the folder yourself if it really is disposable.`,
  );
}
