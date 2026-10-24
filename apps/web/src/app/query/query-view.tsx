"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ClaimEvidence, EvidenceReport, QueryResponse } from "@evidencegraph/core";

import { CostPreview } from "@/components/cost-preview";
import { PageHeader } from "@/components/page-shell";
import { Badge, ClaimStateBadge, SupportBadge, VerdictBanner } from "@/components/research/badges";
import { EvidenceInspector } from "@/components/research/evidence-inspector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/wiki/markdown-view";
import { useWikiSettings } from "@/lib/use-wiki-settings";
import { cn } from "@/lib/utils";

type RunPayload = {
  ok: true;
  model: string;
  response: QueryResponse;
  evidence: EvidenceReport;
  runId: string | null;
  question?: string;
  createdAt?: string;
};

type Failure = { ok?: false; error: string; type?: string };
type RunSummary = { id: string; question: string; model: string; createdAt: string; confidence: string };

export function QueryView() {
  const searchParams = useSearchParams();
  const settings = useWikiSettings();

  const [question, setQuestion] = useState("");
  const [knownSlugs, setKnownSlugs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const inspectorRef = useRef<HTMLDivElement>(null);

  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ slug: string } | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/research", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { runs: RunSummary[] };
      setRuns(data.runs);
    } catch {
      // History is optional; the workspace works without it.
    }
  }, []);

  const openRun = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/research?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as RunPayload | Failure;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setResult(json);
      setQuestion(json.question ?? "");
      setSelectedId(null);
      setPromoteResult(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pages", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { knownSlugs: string[] };
        setKnownSlugs(data.knownSlugs);
      } catch {
        // non-fatal — wikilinks just render conservatively
      }
    })();
    void refreshRuns();
  }, [refreshRuns]);

  const runParam = searchParams.get("run");
  useEffect(() => {
    if (runParam) void openRun(runParam);
  }, [runParam, openRun]);

  // Esc closes the mobile evidence sheet.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setSelectedId(null);
    setPromoteResult(null);
    setPromoteError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = (await res.json()) as RunPayload | Failure;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setResult(json);
      void refreshRuns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPromote() {
    const s = result?.response.suggestedNewPage;
    if (!s) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: s.slug, title: s.title, type: "concept", content: s.content }),
      });
      const json = (await res.json()) as { ok?: true; slug?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPromoteResult({ slug: s.slug });
      setKnownSlugs((prev) => (prev.includes(s.slug) ? prev : [...prev, s.slug]));
    } catch (err) {
      setPromoteError((err as Error).message);
    } finally {
      setPromoting(false);
    }
  }

  const selectedClaim: ClaimEvidence | null =
    result?.evidence.claims.find((c) => c.id === selectedId) ?? null;

  function selectClaim(id: string) {
    setSelectedId(id);
    // On wide screens the inspector is already visible; on small screens it
    // slides up as a sheet. Either way, move focus into it for keyboard users.
    requestAnimationFrame(() => inspectorRef.current?.focus());
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 sm:px-6">
      <PageHeader
        eyebrow="Research workspace"
        title="Ask, then verify"
        description="Every answer is split into claims. Select a claim to see the exact passage it cites and whether that citation really resolves."
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_380px]">
        {/* ---- left rail: research history + pages used ---- */}
        <aside aria-label="Research navigation" className="order-2 space-y-5 lg:order-1">
          <details className="rounded-lg border border-border bg-card p-3" open={runs.length > 0 && !result}>
            <summary className="cursor-pointer text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Recent research ({runs.length})
            </summary>
            {runs.length === 0 ? (
              <p className="mt-2 text-ui text-muted-foreground">
                Nothing yet. Questions you ask are saved in this wiki&apos;s folder so you can reopen them and
                re-check their evidence later.
              </p>
            ) : (
              <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                {runs.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void openRun(r.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-ui hover:bg-accent",
                        result?.runId === r.id && "bg-accent",
                      )}
                    >
                      <span className="line-clamp-2">{r.question}</span>
                      <span className="block text-caption normal-case tracking-normal text-muted-foreground">
                        {r.createdAt.slice(0, 16).replace("T", " ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {result ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <h2 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                Pages used
              </h2>
              {result.evidence.pagesUsed.length === 0 ? (
                <p className="mt-2 text-ui text-muted-foreground">The model listed no pages.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {result.evidence.pagesUsed.map((p) => (
                    <li key={p.slug} className="flex items-center justify-between gap-2 text-ui">
                      {p.status === "exists" ? (
                        <Link href={`/wiki/${p.slug}`} className="min-w-0 truncate text-primary underline underline-offset-2">
                          {p.slug}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate text-muted-foreground line-through">{p.slug}</span>
                      )}
                      {p.status !== "exists" ? (
                        <Badge tone="warn">{p.status === "missing" ? "Not found" : "Unreadable"}</Badge>
                      ) : !p.citedByClaim ? (
                        <Badge tone="neutral" title="Listed as used, but no claim cites it">
                          Uncited
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </aside>

        {/* ---- center: question, answer, claims ---- */}
        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <form onSubmit={onAsk} className="space-y-3">
            <label className="block text-ui font-medium" htmlFor="question">
              Your question
            </label>
            <Textarea
              id="question"
              rows={3}
              placeholder="e.g. At what temperature does capacity fade accelerate?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy}
              className="font-serif text-body"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void onAsk(e as unknown as React.FormEvent);
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!question.trim() || busy}>
                {busy ? "Working…" : "Ask"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Ctrl/Cmd + Enter · sends your question and relevant wiki passages to your configured model
                provider
              </p>
            </div>
            {settings?.settings.showCostEstimates && question.trim() ? (
              <CostPreview
                text={question}
                model={settings.settings.defaultModels.query.model}
                contextOverhead={6000}
                expectedOutputTokens={800}
              />
            ) : null}
          </form>

          <div aria-live="polite">
            {busy ? (
              <div className="space-y-3" role="status">
                <p className="text-ui text-muted-foreground">Retrieving passages, asking the model, and checking its citations…</p>
                <div className="h-20 animate-pulse rounded-lg bg-muted" />
                <div className="h-14 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </div>
            ) : null}
          </div>

          {result && !busy ? (
            <section className="space-y-6">
              <VerdictBanner report={result.evidence} />

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge tone="neutral">Model-reported confidence: {result.response.confidence}</Badge>
                <span>via {result.model}</span>
                {result.createdAt ? <span>· asked {result.createdAt.slice(0, 16).replace("T", " ")}</span> : null}
              </div>

              <article className="rounded-lg border border-border bg-card p-5 sm:p-6">
                <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  Answer
                </h2>
                <MarkdownView content={result.response.answer} knownSlugs={knownSlugs} />
              </article>

              <section aria-labelledby="claims-heading">
                <h2 id="claims-heading" className="mb-1 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  Claims &amp; evidence ({result.evidence.claims.length})
                </h2>
                {result.evidence.claims.some((c) => c.origin === "derived") ? (
                  <p className="mb-2 text-ui text-muted-foreground">
                    The model did not return structured claims, so these were split from the answer text.
                    Citations are page-level only.
                  </p>
                ) : null}
                {result.evidence.malformedClaims.length > 0 ? (
                  <p role="alert" className="mb-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-ui text-warn">
                    {result.evidence.malformedClaims.length} claim entr
                    {result.evidence.malformedClaims.length === 1 ? "y" : "ies"} in the model output could not be
                    read and {result.evidence.malformedClaims.length === 1 ? "was" : "were"} skipped.
                  </p>
                ) : null}
                {result.evidence.claims.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-ui text-muted-foreground">
                    No factual claims were made — the model may be saying the wiki does not cover this question.
                    Read the answer above and any caveats below.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {result.evidence.claims.map((claim) => (
                      <li key={claim.id}>
                        <button
                          type="button"
                          onClick={() => selectClaim(claim.id)}
                          aria-pressed={selectedId === claim.id}
                          className={cn(
                            "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40",
                            selectedId === claim.id ? "border-primary ring-1 ring-primary" : "border-border",
                          )}
                        >
                          <span className="block font-serif text-body leading-snug">{claim.text}</span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                            <ClaimStateBadge state={claim.evidenceState} />
                            <SupportBadge support={claim.support} />
                            <span className="text-xs text-muted-foreground">
                              {claim.citations.filter((c) => !c.isDuplicate).length} citation
                              {claim.citations.filter((c) => !c.isDuplicate).length === 1 ? "" : "s"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {result.response.caveats.length > 0 ? (
                <div>
                  <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Caveats</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {result.response.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.response.suggestedNewPage ? (
                <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
                  <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                    Suggested new page
                  </h3>
                  <p className="mt-2">
                    <strong>{result.response.suggestedNewPage.title}</strong>{" "}
                    <span className="text-xs text-muted-foreground">({result.response.suggestedNewPage.slug})</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{result.response.suggestedNewPage.reason}</p>
                  {promoteResult ? (
                    <p className="mt-3 text-sm text-ok">
                      Saved.{" "}
                      <Link href={`/wiki/${promoteResult.slug}`} className="underline">
                        Open page →
                      </Link>
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button onClick={onPromote} disabled={promoting} variant="outline">
                        {promoting ? "Saving…" : "Save as wiki page"}
                      </Button>
                      {promoteError ? <span className="text-sm text-bad">{promoteError}</span> : null}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* ---- right: evidence inspector (sheet on small screens) ---- */}
        {selectedClaim ? (
          <button
            type="button"
            aria-label="Close evidence inspector"
            tabIndex={-1}
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
          />
        ) : null}
        <div
          ref={inspectorRef}
          tabIndex={-1}
          className={cn(
            "order-3 outline-none",
            selectedClaim
              ? "fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-auto rounded-t-2xl border border-border bg-background p-4 shadow-lg lg:z-auto lg:max-h-[calc(100vh-7rem)] lg:rounded-lg lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden lg:block",
            "lg:sticky lg:top-20 lg:self-start lg:overflow-auto",
          )}
        >
          <EvidenceInspector claim={selectedClaim} onClose={() => setSelectedId(null)} />
        </div>
      </div>
    </div>
  );
}
