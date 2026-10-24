import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { removeStandaloneOutput } from "./clean-standalone.mjs";

// Regression: Next 14's recursiveDelete follows directory links and empties their targets, and a
// finished `pnpm build` leaves such links in .next/standalone. Removing that folder with fs.rm first
// must delete the links without touching the real package they point at.
const roots = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

function makeWebDirWithLinkedPackage() {
  const root = mkdtempSync(join(tmpdir(), "eg-clean-standalone-"));
  roots.push(root);
  const realPackage = join(root, "node_modules", "real-package");
  mkdirSync(join(realPackage, "dist"), { recursive: true });
  writeFileSync(join(realPackage, "index.js"), "module.exports = 1;");
  writeFileSync(join(realPackage, "dist", "a.js"), "module.exports = 2;");

  const webDir = join(root, "apps", "web");
  const linkParent = join(webDir, ".next", "standalone", "node_modules");
  mkdirSync(linkParent, { recursive: true });
  // "junction" needs no special privilege on Windows and behaves as a plain directory link elsewhere.
  symlinkSync(realPackage, join(linkParent, "real-package"), "junction");
  return { webDir, realPackage };
}

describe("removeStandaloneOutput", () => {
  it("removes .next/standalone and everything linked inside it, but not the link targets", async () => {
    const { webDir, realPackage } = makeWebDirWithLinkedPackage();

    await removeStandaloneOutput(webDir);

    expect(existsSync(join(webDir, ".next", "standalone"))).toBe(false);
    expect(existsSync(join(realPackage, "index.js"))).toBe(true);
    expect(readdirSync(join(realPackage, "dist"))).toEqual(["a.js"]);
  });

  it("is a no-op when there is no standalone output", async () => {
    const root = mkdtempSync(join(tmpdir(), "eg-clean-standalone-"));
    roots.push(root);
    await expect(removeStandaloneOutput(root)).resolves.toBeUndefined();
  });

  it("leaves the rest of .next (for example the cache) alone", async () => {
    const { webDir } = makeWebDirWithLinkedPackage();
    mkdirSync(join(webDir, ".next", "cache"), { recursive: true });
    writeFileSync(join(webDir, ".next", "cache", "keep.txt"), "x");

    await removeStandaloneOutput(webDir);

    expect(existsSync(join(webDir, ".next", "cache", "keep.txt"))).toBe(true);
  });
});
