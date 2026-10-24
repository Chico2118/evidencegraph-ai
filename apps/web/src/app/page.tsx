import Link from "next/link";

import {
  getApiKey,
  getTotalCostCents,
  listPageRows,
  listResearchRuns,
  listSourceRows,
  loadGlobalConfig,
  type ResearchRun,
} from "@evidencegraph/core";

import { Onboarding } from "@/components/onboarding";
import { openWikiContext, resolveWikiPath } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { needsKey?: string };
}) {
  const ctx = await openWikiContext();
  let pageCount = 0;
  let sourceCount = 0;
  let runCount = 0;
  let recentRuns: ResearchRun[] = [];
  let costCents = 0;
  const topic = ctx.settings.topic;
  try {
    pageCount = listPageRows(ctx.db).length;
    sourceCount = listSourceRows(ctx.db).length;
    costCents = getTotalCostCents(ctx.db);
  } finally {
    ctx.db.close();
  }
  const wikiPath = resolveWikiPath();
  {
    const runs = await listResearchRuns(wikiPath);
    runCount = runs.length;
    recentRuns = runs.slice(0, 5);
  }

  // First-run gate (docs/04 P0 #1). Block the dashboard until the user has
  // (a) named the wiki's topic so the LLM has scope and (b) configured an
  // OpenRouter key so any operation can actually run. Both are saved to the
  // user's own machine, no remote round-trip.
  //
  // The wizard mode (isFirstRun) vs minimal mode is decided by whether the
  // user has ever completed the welcome flow before — tracked in the global
  // config. First-ever app open gets the 4-step Welcome → Topic → Key →
  // Tour. Returning users who somehow ended up here again (new wiki without
  // a topic, key removed) get the compact single-card form.
  const [apiKeyStatus, globalCfg] = await Promise.all([
    getApiKey(),
    loadGlobalConfig(),
  ]);
  const needsTopic = topic.trim().length === 0;
  const needsKey = searchParams.needsKey === "1";
  // `onboardingCompletedAt` absent means either (a) brand-new install or
  // (b) the user just clicked Settings → About → "Replay welcome tour",
  // which clears the flag. In both cases we want the 4-step wizard, even
  // when topic+key are already saved — the wizard becomes a pure walkthrough
  // and the KeyStep allows blank advance via `alreadyHasKey` downstream.
  const isFirstRun = !globalCfg.onboardingCompletedAt;
  if (needsTopic || needsKey || isFirstRun) {
    return (
      <Onboarding
        needsTopic={needsTopic}
        needsKey={needsKey}
        initialTopic={topic}
        wikiPath={wikiPath}
        isFirstRun={isFirstRun}
      />
    );
  }

  const isFresh = pageCount === 0 && sourceCount === 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-12">
      <header className="mb-10">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          {isFresh ? "Welcome" : "Workspace"}
        </p>
        <h1 className="mt-2 font-display text-display font-semibold">
          {isFresh ? "Start a research workspace you can verify." : "EvidenceGraph AI"}
        </h1>
        <p className="mt-3 max-w-2xl text-body text-muted-foreground">
          {isFresh
            ? "Add sources, ask questions, and inspect the exact passage behind every claim. Citations are checked against your own pages — not taken on trust."
            : "Research You Can Verify. Ask a question, inspect the evidence behind each claim, and review where your sources disagree."}
        </p>
        <p className="mt-2 font-mono text-caption text-muted-foreground">{topic}</p>
      </header>

      <section aria-label="Workspace totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Wiki pages" value={pageCount.toString()} href="/wiki" />
        <StatTile label="Library sources" value={sourceCount.toString()} href="/sources" />
        <StatTile label="Saved research" value={runCount.toString()} href="/query" />
        <StatTile label="Model spend" value={formatCost(costCents)} href="/dashboard" />
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ActionCard
          tone="primary"
          title={isFresh ? "Add your first source" : "Ask a question"}
          body={
            isFresh
              ? "Paste an article, drop a PDF, or fetch a URL. It is compiled into cross-linked wiki pages."
              : "Get an answer split into claims, each with the passage it cites and a citation-integrity check."
          }
          cta={isFresh ? "Open Library →" : "Open Research →"}
          href={isFresh ? "/sources" : "/query"}
        />
        <ActionCard
          title="Library"
          body={
            sourceCount === 0
              ? "Nothing here yet. Add a source to begin."
              : `${sourceCount} source${sourceCount === 1 ? "" : "s"}. Search, filter, and see what finished processing.`
          }
          cta="Open Library →"
          href="/sources"
        />
        <ActionCard
          title="Contradictions"
          body={
            pageCount < 2
              ? "Needs at least two pages to compare."
              : "Review passages that may disagree, with the dates and conditions that could explain it."
          }
          cta={pageCount < 2 ? "Add sources first →" : "Open explorer →"}
          href={pageCount < 2 ? "/sources" : "/contradictions"}
        />
        <ActionCard
          title="Evaluation lab"
          body="Reproducible retrieval and citation-integrity benchmarks, with every metric and denominator defined."
          cta="Open lab →"
          href="/evaluation"
        />
      </section>

      <section aria-labelledby="recent-heading" className="mt-10">
        <h2 id="recent-heading" className="font-display text-h3 font-semibold">
          Recent research
        </h2>
        {recentRuns.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-5 text-ui text-muted-foreground">
            {isFresh
              ? "Once you have sources, the questions you ask appear here so you can reopen them and re-check their evidence."
              : "No questions asked yet. Your research history appears here."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/query?run=${encodeURIComponent(run.id)}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 truncate">{run.question}</span>
                  <span className="shrink-0 text-caption normal-case tracking-normal text-muted-foreground">
                    {run.createdAt.slice(0, 16).replace("T", " ")} UTC · {claimCountOf(run)} claim{claimCountOf(run) === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetaCard
          title="How verification works"
          items={[
            "The model must cite a page, a passage and a verbatim quote for each claim.",
            "Each citation is checked against the real page text: does the page exist, does the passage exist, is the quote really there?",
            "A valid citation is not proof the passage supports the claim — support is shown as “not assessed”.",
          ]}
        />
        <MetaCard
          title="Keyboard"
          items={[
            { kbd: "⌘K", text: "Command palette — jump anywhere" },
            { kbd: "⌘,", text: "Settings" },
            { kbd: "⌘↵", text: "Submit a question" },
            { kbd: "esc", text: "Close the evidence sheet" },
          ]}
        />
      </section>
    </div>
  );
}

// ---- bits ---------------------------------------------------------------

function StatTile({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border/70 bg-card px-4 py-3 transition-all duration-100 hover:border-primary/40 hover:bg-accent/40 active:scale-[0.99]"
    >
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-h2 font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

function ActionCard({
  tone = "default",
  title,
  body,
  cta,
  href,
}: {
  tone?: "default" | "primary";
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      className={
        "group flex flex-col rounded-lg border p-5 transition-all duration-100 active:scale-[0.99] " +
        (primary
          ? "border-primary/40 bg-primary/[0.04] hover:border-primary/60 hover:bg-primary/[0.07]"
          : "border-border/70 bg-card hover:border-border")
      }
    >
      <h2 className="font-display text-h3 font-semibold">{title}</h2>
      <p className="mt-2 flex-1 text-ui text-muted-foreground">{body}</p>
      <p
        className={
          "mt-4 text-ui font-medium " +
          (primary ? "text-primary" : "text-foreground/80 group-hover:text-foreground")
        }
      >
        {cta}
      </p>
    </Link>
  );
}

type MetaItem = string | { kbd: string; text: string };

function MetaCard({ title, items }: { title: string; items: MetaItem[] }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-5">
      <h2 className="font-display text-h3 font-semibold">{title}</h2>
      <ul className="mt-3 space-y-1.5 text-ui text-muted-foreground">
        {items.map((it, i) =>
          typeof it === "string" ? (
            <li key={i} className="leading-relaxed">
              · {it}
            </li>
          ) : (
            <li key={i} className="flex items-center gap-2.5">
              {/* sans font (Inter) so ⌘/↵/esc glyphs render correctly at
                  small sizes; mono fonts often miss or mis-baseline them. */}
              <kbd className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md border border-border bg-muted px-2 font-sans text-[12px] font-medium leading-none text-foreground/80">
                {it.kbd}
              </kbd>
              <span>{it.text}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function claimCountOf(run: ResearchRun): number {
  return Array.isArray(run.response.claims) ? run.response.claims.length : 0;
}

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
  if (cents < 100) return `$${(cents / 100).toFixed(3)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
