#!/usr/bin/env node
// Runs before `next dev` and `next build` (see package.json).
//
// Why: `pnpm build` leaves .next/standalone/ containing links into the real pnpm packages
// (node_modules/.pnpm/...). On its next start, `next dev` and `next build` empty .next with
// Next 14's recursiveDelete, which FOLLOWS links to directories and deletes what is inside
// the link target. The result is that the real packages in node_modules lose their files
// (observed: `next` itself, then "Cannot find module 'next/dist/pages/_app'"), and the app
// no longer starts until `pnpm install --force` is run.
//
// fs.rm with recursive removes a link without following it, so removing .next/standalone
// ourselves first leaves nothing for recursiveDelete to follow. Remove this script once Next
// no longer follows links when cleaning its output folder.

import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Deletes <webDir>/.next/standalone without following links. Safe if it does not exist. */
export async function removeStandaloneOutput(webDir) {
  await rm(join(webDir, ".next", "standalone"), { recursive: true, force: true });
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await removeStandaloneOutput(resolve(here, ".."));
}
