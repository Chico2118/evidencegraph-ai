import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Regression: the full navigation bar needs ~1155px, but it used to appear at Tailwind's `lg`
// (1024px), so between 1024 and 1154px it overflowed and pushed Settings and the theme toggle
// off-screen. This guards the breakpoint pairing; the pixel behaviour itself was checked in a browser.
const source = readFileSync(join(__dirname, "app-header.tsx"), "utf8");

describe("AppHeader responsive breakpoint", () => {
  it("shows the full bar and hides the compact menu at the same width", () => {
    expect(source).toContain("hidden min-[1160px]:block"); // workspace switcher
    expect(source).toContain("text-ui min-[1160px]:flex"); // primary and secondary nav (two uses)
    expect(source).toContain("relative min-[1160px]:hidden"); // compact ≡ menu
    expect(source.match(/min-\[1160px\]:flex/g)).toHaveLength(2);
  });

  it("no longer switches layouts at the too-narrow `lg` breakpoint", () => {
    expect(source).not.toMatch(/\blg:(flex|block|hidden)\b/);
  });
});
