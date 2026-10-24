import Link from "next/link";

import { PageContainer } from "@/components/page-shell";
import { APP_VERSION } from "@/components/footer";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <PageContainer width="lg">
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">About</p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          Research you can verify.
        </h1>
        <p className="mt-5 max-w-2xl font-serif text-body text-muted-foreground">
          EvidenceGraph AI is an evidence-first research workspace. You add sources, an LLM compiles
          them into a cross-linked markdown knowledge base, and when you ask a question the answer
          arrives broken into individual claims — each tied to the exact passage it came from, with
          a deterministic check that the citation really resolves.
        </p>
      </header>

      <Section eyebrow="The idea" title="Why a cited answer is not yet a trustworthy answer">
        <p>
          A fluent answer with citations looks verified whether or not the citations are real.
          Models invent page names, paste quotations that appear nowhere in the source, and cite a
          real passage that says something else. EvidenceGraph AI separates two questions that most
          tools blur together:
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SubCard title="Citation integrity — checked automatically">
            Does the citation point at a page and passage that exist, and does any quoted text
            actually appear in that passage? This is deterministic and tested.
          </SubCard>
          <SubCard title="Semantic support — shown honestly">
            Does the passage actually support the claim? That needs judgment. The app labels it
            “support not assessed” instead of implying a verdict it cannot back up.
          </SubCard>
        </div>
      </Section>

      <Section eyebrow="Features" title="What you can do">
        <ul className="space-y-2">
          <li>
            <strong>Research workspace</strong> — ask a question; get claims, per-claim evidence,
            and a visible integrity status for every citation.
          </li>
          <li>
            <strong>Evidence inspector</strong> — click a claim to read the cited passage, see which
            raw sources the page was compiled from, and jump to the passage in context.
          </li>
          <li>
            <strong>Contradiction explorer</strong> — compare passages that may disagree, see why
            they were flagged, and mark each as a real conflict or a difference of scope.
          </li>
          <li>
            <strong>Evaluation lab</strong> — a reproducible benchmark for retrieval and citation
            integrity, with every metric and denominator defined.
          </li>
          <li>
            <strong>Library, wiki and graph</strong> — the inherited ingest pipeline, markdown wiki
            and 3D link graph that everything above is built on.
          </li>
        </ul>
      </Section>

      <Section eyebrow="Provenance" title="Built on LLM Wiki — what is inherited, what is new">
        <p>
          EvidenceGraph AI is a derivative of{" "}
          <a
            href="https://github.com/ddsyasas/llm-wiki"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            LLM Wiki
          </a>{" "}
          by Yasas (MIT license), itself an implementation of the pattern{" "}
          <a
            href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            described by Andrej Karpathy
          </a>
          . The ingest pipeline, markdown wiki, SQLite metadata, graph, chats, lint, multi-wiki
          support and provider abstraction are inherited. The claim-level evidence model, citation
          validation, passage addressing, retrieval changes, contradiction explorer, evaluation lab,
          rebrand and redesign were added by{" "}
          <a
            href="https://github.com/Chico2118"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Shivam Jani
          </a>
          . See <code>NOTICE.md</code> in the repository for the itemized list.
        </p>
      </Section>

      <Section eyebrow="Honest limits" title="What it does not do">
        <ul className="space-y-2">
          {LIMITS.map((l) => (
            <li key={l.title} className="border-l-2 border-border pl-4">
              <p className="font-medium text-foreground">{l.title}</p>
              <p className="mt-0.5 text-ui text-muted-foreground">{l.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Privacy" title="Where your data goes">
        <p>
          Everything is stored as files on your machine. When you run an ingest, query, chat or
          lint, the relevant text is sent to the model provider you configured — OpenRouter (cloud)
          or a local Ollama server. Nothing is sent anywhere else: there is no telemetry and no
          analytics. The evaluation lab and citation validation run entirely offline.
        </p>
      </Section>

      <Section eyebrow="Tech" title="The stack, briefly">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {STACK.map((row) => (
            <div key={row.label} className="flex items-baseline gap-3">
              <dt className="w-32 shrink-0 text-caption uppercase tracking-wider text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-ui">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section eyebrow="Credits" title="Developer and upstream">
        <p>
          EvidenceGraph AI v{APP_VERSION} — developed by{" "}
          <a
            href="https://github.com/Chico2118"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Shivam Jani
          </a>{" "}
          (Computer Science student, full-stack &amp; AI developer). Released under the MIT license;
          the upstream copyright notice is preserved in <code>LICENSE</code>.
        </p>
        <p className="text-caption text-muted-foreground">
          Not affiliated with Andrej Karpathy, Anthropic, or the upstream LLM Wiki author.
        </p>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/help"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          New here? Read the Help guide →
        </Link>
        <Link
          href="/developers"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          Building or extending it? Developers page →
        </Link>
      </div>
    </PageContainer>
  );
}

// ---- pieces -------------------------------------------------------------

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h2 className="mb-4 mt-1 font-display text-h2 font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 font-serif text-body leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/70 bg-card p-4">
      <p className="font-display text-h3 font-medium tracking-tight">{title}</p>
      <p className="mt-1 font-sans text-ui text-muted-foreground">{children}</p>
    </div>
  );
}

const LIMITS: Array<{ title: string; body: string }> = [
  {
    title: "Support is not scored by a model (yet).",
    body: "A valid citation proves the passage exists, not that it backs the claim. Semantic-support assessment is deliberately left out until it can be evaluated against labeled examples.",
  },
  {
    title: "Evidence lives at wiki-page level.",
    body: "Claims cite passages of compiled wiki pages; the raw source behind each page is shown as lineage, not as a verbatim quote of the original file.",
  },
  {
    title: "Contradictions are candidates, not verdicts.",
    body: "The explorer flags passages that may conflict and helps you review them. A flag can reflect a different date, scope or definition.",
  },
  {
    title: "Small benchmark.",
    body: "The bundled evaluation set is small and synthetic. Treat its numbers as a regression guard, not as a claim about real-world accuracy.",
  },
];

const STACK: Array<{ label: string; value: string }> = [
  { label: "Framework", value: "Next.js 14 (App Router), TypeScript strict" },
  { label: "UI", value: "Tailwind, shadcn-style components, Fraunces / Crimson Pro / Inter" },
  { label: "Storage", value: "Markdown files + SQLite (better-sqlite3) metadata, FTS5 search" },
  { label: "LLM", value: "OpenRouter (BYOK) or local Ollama, chosen per operation" },
  { label: "Validation", value: "zod at every model boundary" },
  { label: "Tests", value: "vitest — deterministic fixtures, no paid model calls" },
  { label: "License", value: "MIT (upstream notice preserved)" },
];
