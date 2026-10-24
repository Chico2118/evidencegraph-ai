import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertSafeToReseed, DEMO_MARKER } from "./demo-guard";

// Regression for "demo startup cannot delete real data": `pnpm demo` removes its wiki folder before re-seeding,
// so it must refuse any folder that has files and is not clearly a disposable demo wiki.
const made: string[] = [];
afterEach(async () => {
  while (made.length) await rm(made.pop()!, { recursive: true, force: true });
});

async function folder(parent: string, name: string, files: string[] = []): Promise<string> {
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  for (const f of files) await writeFile(join(dir, f), "x");
  made.push(dir);
  return dir;
}

describe("assertSafeToReseed", () => {
  it("accepts a folder that does not exist, and an empty one", async () => {
    const base = await mkdtemp(join(tmpdir(), "eg-guard-"));
    made.push(base);
    await expect(assertSafeToReseed(join(base, "missing"))).resolves.toBeUndefined();
    await expect(assertSafeToReseed(await folder(base, "empty"))).resolves.toBeUndefined();
  });

  it("accepts a folder carrying the demo marker, wherever it is", async () => {
    const base = await mkdtemp(join(tmpdir(), "eg-guard-"));
    made.push(base);
    const dir = await folder(base, "anything", [DEMO_MARKER, "index.md"]);
    await expect(assertSafeToReseed(dir)).resolves.toBeUndefined();
  });

  it("refuses a folder with files and no marker, such as a real wiki", async () => {
    const base = await mkdtemp(join(tmpdir(), "eg-guard-"));
    made.push(base);
    const dir = await folder(base, "my-research-wiki", ["index.md", "CLAUDE.md"]);
    await expect(assertSafeToReseed(dir)).rejects.toThrow(/Refusing to delete/);
    await expect(assertSafeToReseed(dir)).rejects.toThrow(DEMO_MARKER);
  });

  it("accepts an unmarked evidencegraph-demo* folder in the OS temp directory (older demos had no marker)", async () => {
    const dir = await folder(tmpdir(), `evidencegraph-demo-guardtest-${process.pid}`, ["index.md"]);
    await expect(assertSafeToReseed(dir)).resolves.toBeUndefined();
  });

  it("does not trust a demo-looking name outside the temp directory", async () => {
    const base = await mkdtemp(join(tmpdir(), "eg-guard-"));
    made.push(base);
    // Looks like a demo folder, but the parent is another place: the name alone proves nothing.
    const dir = await folder(join(base, "projects"), "evidencegraph-demo", ["index.md"]);
    await expect(assertSafeToReseed(dir)).rejects.toThrow(/Refusing to delete/);
  });
});
