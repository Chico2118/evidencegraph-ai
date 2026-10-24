#!/usr/bin/env node
// Runs once after `npm install -g evidencegraph-ai` (or `npm install` of the
// tarball locally). Prints a friendly "you're installed, here's what to do
// next" banner so users have a clear cue after the install spinner finishes.
//
// Kept deliberately minimal — no network calls, no env probing, no file
// writes. Just a banner. Anything fancier moves to `evidencegraph doctor`.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(SELF_DIR, "..");

let version = "1.x";
try {
  const pkg = JSON.parse(await readFile(join(PACKAGE_DIR, "package.json"), "utf8"));
  if (typeof pkg.version === "string") version = pkg.version;
} catch {
  // best-effort — fall back to the static placeholder
}

// 49 = inside-width of the box. Pad from visible text width so version
// strings of any length keep the box square.
const innerWidth = 49;
const title = `  EvidenceGraph AI v${version} installed`;
const pad = " ".repeat(Math.max(0, innerWidth - title.length));
const top = "─".repeat(innerWidth);
const banner = `
\x1b[36m╭${top}╮\x1b[0m
\x1b[36m│\x1b[0m  \x1b[1mEvidenceGraph AI\x1b[0m v${version} installed${pad}\x1b[36m│\x1b[0m
\x1b[36m╰${top}╯\x1b[0m

  Get started in three commands:

    \x1b[1mevidencegraph doctor\x1b[0m    Verify install + check for an API key
    \x1b[1mevidencegraph start\x1b[0m     Boot the server (auto-opens browser)
    \x1b[1mevidencegraph help\x1b[0m      Full command + flag list

  You'll need an OpenRouter API key — get one at
  \x1b[34mhttps://openrouter.ai/keys\x1b[0m (pay-as-you-go, ~$5 lasts weeks).

  Project home: \x1b[34mhttps://github.com/Chico2118/evidencegraph-ai\x1b[0m
`;

// Don't fail the install if stdout is somehow unwritable.
try {
  process.stdout.write(banner);
} catch {
  // ignore
}
