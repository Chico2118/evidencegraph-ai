"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Lets the evidence inspector deep-link into a wiki page: `?passage=p3&q=<start of the passage>`.
// The passage id alone is not enough to find the block in rendered markdown
// (rendering and passage segmentation are separate), so we match on the
// passage's opening text, then highlight the whole top-level block it sits in.
// Purely visual — if nothing matches, the page simply renders unhighlighted.

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_m, slug: string, label?: string) => label ?? slug)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function PassageHighlighter({ containerId }: { containerId: string }) {
  const params = useSearchParams();
  const q = params.get("q");

  useEffect(() => {
    if (!q) return;
    const container = document.getElementById(containerId);
    const prose = container?.firstElementChild;
    if (!prose) return;
    const needle = norm(q).slice(0, 60);
    if (needle.length < 8) return;

    const target = Array.from(prose.children).find((el) => norm(el.textContent ?? "").includes(needle));
    if (!target) return;

    target.classList.add("eg-passage-highlight");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    return () => target.classList.remove("eg-passage-highlight");
  }, [q, containerId]);

  return null;
}
