"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AboutTab() {
  const router = useRouter();
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  async function replayTour() {
    if (!confirm("Replay the first-run welcome wizard? Your topic and API key stay set.")) return;
    setReplayBusy(true);
    setReplayError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // /, triggers the wizard since onboardingCompletedAt is now absent.
      router.push("/");
      router.refresh();
    } catch (err) {
      setReplayError((err as Error).message);
      setReplayBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="text-lg font-medium">EvidenceGraph AI — Research You Can Verify</h2>
        <p className="mt-1 text-muted-foreground">
          Evidence-first research workspace. Developed by{" "}
          <a
            href="https://github.com/Chico2118"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Shivam Jani
          </a>
          , derived from{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            LLM Wiki
          </a>{" "}
          by Yasas (MIT).
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pattern
        </h3>
        <p className="mt-1 text-muted-foreground">
          Implements{" "}
          <a
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Andrej Karpathy&apos;s LLM Wiki pattern
          </a>{" "}
          — three layers (raw sources, wiki, schema), three operations (ingest, query, lint),
          one folder of markdown files. The wiki is a persistent compounding artifact, not
          query-time retrieval.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Privacy
        </h3>
        <p className="mt-1 text-muted-foreground">
          Everything runs on your machine. No telemetry, no analytics, no remote storage.
          Model calls go only to the provider you configured (OpenRouter, or a local Ollama server). Your wiki content lives only in the folder you
          chose — sync it with git/Dropbox/iCloud if you want, or don&apos;t.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          License
        </h3>
        <p className="mt-1 text-muted-foreground">
          MIT. Copyright is held jointly: Yasas (original project) and Shivam Jani
          (modifications). See the LICENSE and NOTICE.md files in the repository.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Acknowledgements
        </h3>
        <p className="mt-1 text-muted-foreground">
          Built on Next.js, Tailwind, shadcn/ui, better-sqlite3, mammoth, gray-matter,
          chokidar, and the openai SDK pointed at OpenRouter.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          First-run tour
        </h3>
        <p className="mt-1 text-muted-foreground">
          The 4-step welcome wizard (intro + topic + key + feature tour) only
          fires on the very first app open. Replay it any time:
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={replayTour}
          disabled={replayBusy}
          className="mt-2"
        >
          {replayBusy ? "Resetting…" : "Replay welcome tour"}
        </Button>
        {replayError ? (
          <p className="mt-2 text-xs text-destructive">{replayError}</p>
        ) : null}
      </div>
    </div>
  );
}
