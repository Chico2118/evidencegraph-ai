import Link from "next/link";

import { PageContainer } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <PageContainer width="lg">
      <header className="mb-12">
        <p className="text-caption uppercase tracking-wider text-muted-foreground">
          Help
        </p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-tight">
          How to use EvidenceGraph AI.
        </h1>
        <p className="mt-5 max-w-2xl text-body font-serif text-muted-foreground">
          Everything you can do in the app, in the order you'd typically do it.
          For the why-it-exists story see{" "}
          <Link href="/about" className="text-primary underline underline-offset-2">
            About
          </Link>
          ; for how it's built see{" "}
          <Link href="/developers" className="text-primary underline underline-offset-2">
            Developers
          </Link>
          .
        </p>
      </header>

      {/* Table of contents — long page, helps scanning. */}
      <nav className="mb-12 rounded-md border border-border/70 bg-card p-4">
        <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-ui sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-foreground/80 hover:text-primary"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="overview" eyebrow="Mental model" title="The three layers">
        <p>
          Three layers live in the wiki folder you chose:
        </p>
        <ul className="space-y-2">
          <Layer
            name="raw/"
            what="Your sources, untouched. Whatever you pasted or uploaded, byte-for-byte. Never deleted by the app."
          />
          <Layer
            name="wiki/"
            what="The LLM-maintained pages. Cross-linked, short, structured. Lossy by design — they summarize raw/."
          />
          <Layer
            name="CLAUDE.md"
            what="The schema. A few paragraphs of plain English telling the LLM what this wiki is about and how to organize it. The LLM reads it on every operation."
          />
        </ul>
        <p className="mt-4">
          And three operations the LLM performs against those layers:
        </p>
        <ul className="space-y-2">
          <Op
            name="Ingest"
            what="Read a new source → write/update wiki pages, refresh the index, log the change."
          />
          <Op
            name="Research"
            what="Read your question + the wiki → produce an answer split into claims, each with cited passages that are verified against the page text."
          />
          <Op
            name="Lint"
            what="Read the whole wiki → flag contradictions, broken links, orphans, missing pages, stale claims."
          />
        </ul>
      </Section>

      <Section id="wikis" eyebrow="Multiple wikis" title="Holding more than one wiki">
        <p>
          A wiki is meant to focus on one topic (the schema you set on first run
          tells the LLM what scope it should stay inside). For separate topics —
          say <em>Physics</em>, <em>Machine learning research</em>, and a{" "}
          <em>Personal knowledge base</em> — you keep separate wiki folders and
          switch between them.
        </p>
        <p>
          Open{" "}
          <Link
            href="/settings"
            className="text-primary underline underline-offset-2"
          >
            Settings → Wikis
          </Link>
          . You'll see your currently-active wiki at the top and any others
          you've created or visited. Two things you can do:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Switch</strong> — click Switch on a row. The whole app
            re-points to that wiki on the next request. No restart, no port
            change. Your other wiki stays exactly where it is on disk.
          </li>
          <li>
            <strong>Create new wiki</strong> — give it a topic + folder path,
            click Create + switch. The folder is created, schema initialized,
            you land on the dashboard ready to add sources.
          </li>
        </ul>
        <p>
          The active wiki is per-app-install (not per-browser-tab). If you want
          to browse two wikis truly side-by-side, run two dev servers on
          different ports — one terminal with <code>LLM_WIKI_PATH=~/wiki-a pnpm dev</code>{" "}
          and another with <code>LLM_WIKI_PATH=~/wiki-b pnpm dev</code>.
        </p>
        <p>
          Removing a wiki from the picker only edits the config — the folder +
          files stay on disk. If you really want to delete a wiki, remove the
          folder yourself (<code>rm -rf ~/wiki-foo</code>).
        </p>
      </Section>

      <Section
        id="setup"
        eyebrow="First-run"
        title="Setting up: topic + API key"
      >
        <p>
          When you open the app for the first time you'll see a setup card
          asking for two things:
        </p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Wiki topic.</strong> One line describing what this wiki is
            about (e.g. <em>"Quantum computing research and the algorithms
            underlying it"</em>). The LLM reads this on every operation, so
            specific is better than generic.
          </li>
          <li>
            <strong>OpenRouter API key.</strong> Get one at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              openrouter.ai/keys
            </a>{" "}
            — pay-as-you-go, one key gives access to Claude, GPT, Gemini,
            Llama, more. Stored safely on your machine.
            <br />
            <span className="text-xs text-muted-foreground">
              Note: If you plan to use local Ollama for all models, you do not need an OpenRouter key! You can skip this key setup step during onboarding and configure Ollama in Settings.
            </span>
          </li>
        </ol>
        <p>
          You can change either later in <Link href="/settings" className="text-primary underline underline-offset-2">Settings</Link>.
        </p>
      </Section>

      <Section
        id="sources"
        eyebrow="Adding to the wiki"
        title="Library — getting content in"
      >
        <p>
          Go to{" "}
          <Link href="/sources" className="text-primary underline underline-offset-2">
            Sources
          </Link>{" "}
          and pick a mode at the top:
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Paste</strong> — drop text or markdown in the textarea.
            Fastest for "I just want to add this article."
          </li>
          <li>
            <strong>File</strong> — drag a file in or click to choose. Supported:{" "}
            <code>.md / .txt / .html / .pdf / .docx / .pptx / .xlsx / .png /
            .jpg / .webp</code>. PDFs and images go through a vision model;
            everything else is text-extracted locally.
          </li>
          <li>
            <strong>URL</strong> — fetches the page, runs Mozilla's Readability
            to strip nav/ads/sidebars, ingests the clean article.
          </li>
        </ul>
        <p>
          The page shows a <strong>cost preview</strong> before you ingest so
          there are no surprises. Click <strong>Ingest</strong>; ~10–30s
          later you'll see a summary of new pages, updated pages, and any
          contradictions the LLM flagged.
        </p>
        <p>
          Above the form, <strong>Ingested sources</strong> lists everything
          you've added with format, size, date, and how many wiki pages it
          contributed to. Click any row to see the original + full lineage.
        </p>
      </Section>

      <Section
        id="wiki"
        eyebrow="Reading"
        title="The wiki — browsing your pages"
      >
        <p>
          <Link href="/wiki" className="text-primary underline underline-offset-2">
            /wiki
          </Link>{" "}
          shows your pages as cards grouped by type (Overviews → Concepts →
          Entities → Comparisons → Sources). Each card shows the title, a
          short summary, tags, and when it was last touched.
        </p>
        <p>Click any card and you'll see:</p>
        <ul className="space-y-1">
          <li>The page body, rendered as readable prose.</li>
          <li>
            <strong>Sources</strong> at the bottom — chips linking to the
            raw inputs the LLM compiled this page from.
          </li>
          <li>
            <strong>Backlinks</strong> — every other wiki page that mentions
            this one. The graph view in list form.
          </li>
          <li>
            An <strong>Edit</strong> button in the header. Editing is a real
            split-pane markdown editor; saves back up the prior version to{" "}
            <code>.llm-wiki/page-history/</code>.
          </li>
        </ul>
        <p>
          The sidebar has a filter input — type to narrow the page list. Or
          press <kbd className="rounded border border-border bg-muted/50 px-1 font-sans text-[11px]">⌘K</kbd>{" "}
          anywhere to fuzzy-find by title.
        </p>
      </Section>

      <Section
        id="research"
        eyebrow="Research"
        title="Research — claims, evidence and what the checks mean"
      >
        <p>
          <Link href="/query" className="text-primary underline underline-offset-2">Research</Link>{" "}
          answers a question and splits the answer into <strong>claims</strong>. For each claim the model must cite a
          page, a passage (<code>p1</code>, <code>p2</code>…) and a verbatim quote. EvidenceGraph AI then checks every
          citation against the real page text. Select a claim to open the <strong>evidence inspector</strong>.
        </p>
        <ul className="space-y-2">
          <li>
            <strong>Valid citation</strong> — the page and passage exist and any quoted text really appears in that
            passage. <em>It does not mean the passage supports the claim.</em> Read it and judge.
          </li>
          <li>
            <strong>Invalid citation</strong> — the passage does not exist, or the quote is not in it (the inspector shows
            what the passage actually says).
          </li>
          <li>
            <strong>Evidence unavailable</strong> — the cited page does not exist or cannot be read, for example it was
            deleted after the answer. Reopen a saved question and it is re-checked against the wiki as it is now.
          </li>
          <li>
            <strong>No evidence cited</strong> — the claim names no source. Treat it as unsupported.
          </li>
          <li>
            <strong>Support not assessed</strong> — shown on every claim: whether the passage truly backs the claim is not
            judged by the app.
          </li>
        </ul>
        <p>
          The model&apos;s own &ldquo;confidence&rdquo; is shown for reference only. If it says <em>high</em> while some claims
          lack valid citations, the page warns you.
        </p>
      </Section>

      <Section
        id="contradictions"
        eyebrow="Review"
        title="Contradictions — passages that may disagree"
      >
        <p>
          <Link href="/contradictions" className="text-primary underline underline-offset-2">Contradictions</Link>{" "}
          compares sentences across your wiki pages, locally and for free (no model call), and lists pairs whose numbers,
          negation or wording conflict. Each is a <strong>possible conflict</strong> with the reason it was flagged and
          differences that might explain it (page dates, stated conditions). Mark each one{" "}
          <em>Confirm contradiction</em>, <em>Different scope or date</em> or <em>Not a conflict</em>; your decision is saved
          in the wiki folder. Paraphrased conflicts are not detected.
        </p>
      </Section>

      <Section
        id="evaluation"
        eyebrow="Measurement"
        title="Evaluation lab — what is measured"
      >
        <p>
          <Link href="/evaluation" className="text-primary underline underline-offset-2">Evaluation</Link>{" "}
          shows reproducible benchmark results on a small synthetic corpus, with every metric&apos;s definition and sample size.
          It is a regression guard, not a claim about real-world accuracy; real-model behavior is not measured there.
        </p>
      </Section>

      <Section
        id="query"
        eyebrow="Asking questions"
        title="Research vs Chats — when to use which"
      >
        <p>
          Two ways to ask the wiki things:
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubCard title="Research — one-shot Q&A with evidence">
            For "ask once and move on." Each question is independent; no
            memory between them. Answer comes with claim-level evidence and an
            optional <strong>Save as wiki page</strong> button if it's
            promotion-worthy.
          </SubCard>
          <SubCard title="Chats — multi-turn threads">
            For ongoing investigations. Each chat is a real markdown file in{" "}
            <code>chats/</code>. Pin, rename, move between folders. Every
            assistant message has its own <strong>Save as wiki page</strong>
            {" "}link; the whole chat has an <strong>Ingest → wiki</strong>{" "}
            button in the header so the synthesis becomes permanent pages.
          </SubCard>
        </div>
      </Section>

      <Section
        id="lint"
        eyebrow="Wiki health"
        title="Lint — finding rot before it spreads"
      >
        <p>
          <Link href="/lint" className="text-primary underline underline-offset-2">
            /lint
          </Link>{" "}
          runs two passes: a fast local scan (broken{" "}
          <code>[[wikilinks]]</code>, orphan pages) and an LLM pass for things
          a local scan can't see (contradictions between pages, missing pages
          that probably should exist, stale claims, gaps).
        </p>
        <p>Per-issue fix buttons:</p>
        <ul className="space-y-1">
          <li>
            <strong>Remove broken link</strong> — strips the bad{" "}
            <code>[[slug]]</code> from its host page. Local, free, instant.
          </li>
          <li>
            <strong>Create page</strong> / <strong>Create stub</strong> —
            drafts a small page for a missing slug using context from the
            pages that reference it. LLM-powered, ~$0.01 per click.
          </li>
          <li>
            <strong>Apply suggested fix</strong> — sends the affected page +
            the LLM's suggestion to the lint model, writes the rewritten
            page back. Backed up to{" "}
            <code>.llm-wiki/page-history/</code>.
          </li>
        </ul>
        <p>Bulk fixes at the top of the page:</p>
        <ul className="space-y-1">
          <li>
            <strong>Rebuild index</strong> — rewrites <code>index.md</code>{" "}
            from the page files on disk. Adds missing entries, removes
            orphans. Free, local.
          </li>
          <li>
            <strong>Remove all broken links (N)</strong> — confirm-then-apply
            for every local-detected broken link in one pass.
          </li>
        </ul>
        <p>
          The <strong>Recent runs</strong> panel shows the trend — each lint
          run gets a one-line entry in <code>log.md</code>. After fixes, re-run
          and watch the count drop (in green).
        </p>
      </Section>

      <Section
        id="graph"
        eyebrow="Seeing the shape"
        title="Graph — your knowledge as a 3D network"
      >
        <p>
          <Link href="/graph" className="text-primary underline underline-offset-2">
            /graph
          </Link>{" "}
          renders your wiki as a 3D force-directed graph. Each page is a node;
          each <code>[[wikilink]]</code> between two pages is an edge. The same
          look-and-feel as Obsidian's graph view, but with one important
          difference:
        </p>
        <p>
          <strong>Nodes are colored by page type</strong>, not by tag or folder.
          The LLM assigns a type to every page during ingest, so the graph gives
          you an at-a-glance read of what kind of knowledge your wiki holds:
        </p>
        <ul className="space-y-1">
          <li>
            <span className="font-medium" style={{ color: "#dc2626" }}>Red</span>
            {" "}— Overviews (high-level synthesis pages)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#0891b2" }}>Cyan</span>
            {" "}— Concepts (ideas, techniques, frameworks)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#d97706" }}>Amber</span>
            {" "}— Entities (people, organizations, places)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#7c3aed" }}>Violet</span>
            {" "}— Comparisons (two-or-more-things contrasted)
          </li>
          <li>
            <span className="font-medium" style={{ color: "#64748b" }}>Slate</span>
            {" "}— Source-type pages
          </li>
        </ul>
        <p>
          <strong>Node size</strong> scales with link count (degree). Heavily-
          connected pages grow larger — they're your wiki's central concepts.
          <strong> Particles flowing along edges</strong> show direction.
        </p>
        <p>
          <strong>Click a node</strong> to focus it: the camera flies to it,
          neighbors stay full-color, non-neighbors fade out. The side panel
          shows the page's preview, tags, and a clickable list of every
          connected page — letting you walk the graph by associations instead
          of by name. URL updates to <code>/graph?node=&lt;slug&gt;</code> so
          you can bookmark or share a focused view.
        </p>
        <p>
          As you ingest more sources you'll watch the graph grow: new nodes
          spring into place, and edges form from any existing pages that
          mention the new one.
        </p>
      </Section>

      <Section
        id="schema"
        eyebrow="Telling the LLM what you want"
        title="Schema — editing CLAUDE.md"
      >
        <p>
          <Link href="/schema" className="text-primary underline underline-offset-2">
            /schema
          </Link>{" "}
          is a split-pane editor for the schema file the LLM reads on every
          operation. Default contents are generic; replace with your specifics
          to make the agent's output dramatically better.
        </p>
        <p>What works well in a schema:</p>
        <ul className="space-y-1">
          <li>What this wiki is about, in 1–3 sentences.</li>
          <li>
            What kinds of pages you want (and don't want) — e.g. <em>"entities
            for researchers but not for institutions"</em>.
          </li>
          <li>Naming conventions for slugs you care about.</li>
          <li>
            Subject-matter pet peeves the LLM should respect (e.g.{" "}
            <em>"don't conflate quantum advantage with quantum supremacy"</em>).
          </li>
        </ul>
        <p>
          Saves back up the prior version to{" "}
          <code>.llm-wiki/schema-history/</code> (last 10 kept).
        </p>
      </Section>

      <Section
        id="settings"
        eyebrow="Tuning the loop"
        title="Settings — models, costs, key"
      >
        <ul className="space-y-1">
          <li>
            <strong>General</strong> — wiki topic, theme (light / dark / auto).
          </li>
          <li>
            <strong>Models</strong> — pick a provider (OpenRouter or local Ollama) and a model for each operation (ingest, query, chat, lint, vision). You can mix and match cloud models and local inference. Dropdowns of curated choices plus a custom-slug field for anything else. If you pick Ollama anywhere, see the{" "}
            <Link href="/local-models" className="text-primary underline underline-offset-2">
              local models setup guide
            </Link>{" "}
            for installation + hardware requirements per model — Ollama needs to be running locally before those slots will work.
          </li>
          <li>
            <strong>API</strong> — OpenRouter key. Test before saving; mask
            after. (Not needed if you only use local Ollama!).
          </li>
          <li>
            <strong>Costs</strong> — running tally of input/output tokens per
            model + estimated $ spend.
          </li>
          <li>
            <strong>About</strong> — version, license, links.
          </li>
        </ul>
        <p>
          Rule of thumb: cheap-fast model for ingest (you'll run it a lot),
          smarter model for query / lint / chat (user-facing answers).
        </p>
      </Section>

      <Section
        id="local-models"
        eyebrow="Want to run models locally?"
        title="Local models (Ollama) — separate setup guide"
      >
        <p>
          Ollama lets you run LLMs on your own machine for free (after the
          one-time model download), keeping all your data local. EvidenceGraph AI
          supports it as a per-slot provider in Settings → Models.
        </p>
        <p>
          Because Ollama itself needs to be installed + running before EvidenceGraph AI
          can talk to it, plus picking the right model depends heavily on what
          hardware you have, the full setup lives on its own page:
        </p>
        <p>
          <Link
            href="/local-models"
            className="text-primary underline underline-offset-2"
          >
            → Open the Ollama setup guide
          </Link>
        </p>
        <p>
          Covers: install steps for macOS / Linux / Windows, pulling models, a
          hardware-requirements table showing RAM / disk / speed per model on
          common machines, a quick picker for which model to start with based on
          your specs, and troubleshooting common errors.
        </p>
      </Section>

      <Section
        id="dashboard"
        eyebrow="Across all wikis"
        title="The health dashboard"
      >
        <p>
          The per-wiki home page (<Link href="/" className="text-primary underline underline-offset-2">/</Link>)
          shows numbers for whatever wiki is currently active. The dashboard at{" "}
          <Link href="/dashboard" className="text-primary underline underline-offset-2">/dashboard</Link>{" "}
          shows the same numbers for every wiki you've ever opened, side by side
          — pages, sources, chats, LLM spend, last touched. Sorted by recency so
          the wikis you actually use bubble to the top.
        </p>
        <p>
          A rollup row across the top adds them all up — the cumulative spend
          answers the "how much have I actually spent on this app" question that
          per-wiki cost numbers can't.
        </p>
        <p>
          Three ways to get there: <strong>footer link</strong> (every screen),{" "}
          <strong>LLM spend</strong> tile on the home page, <strong>⌘K → Dashboard</strong>.
          Each card has a <em>Switch →</em> button to jump into that wiki.
        </p>
      </Section>

      <Section
        id="disk"
        eyebrow="The folder"
        title="Where everything lives on disk"
      >
        <p>
          Your wiki folder (default <code>~/llm-wiki-default</code>, override
          with <code>LLM_WIKI_PATH</code>):
        </p>
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-card p-4 text-[12px] leading-relaxed">
{`~/llm-wiki-default/
├── CLAUDE.md              # the schema you edit at /schema
├── index.md               # auto-maintained catalog of pages
├── log.md                 # every ingest / edit / lint / schema-save
├── raw/                   # original source files, untouched
├── wiki/                  # LLM-maintained pages
├── chats/                 # chat threads as .md files
└── .llm-wiki/             # SQLite + page-history + schema-history`}
        </pre>
        <p>
          You can browse <code>log.md</code> through the app at{" "}
          <Link href="/log" className="text-primary underline underline-offset-2">
            /log
          </Link>
          . Everything else is plain markdown — open it in Obsidian, VS Code,
          vim, or sync with iCloud / git. If you uninstall the app, the
          folder remains valid and useful.
        </p>
      </Section>

      <Section
        id="updating"
        eyebrow="Staying current"
        title="Updating"
      >
        <p>
          EvidenceGraph AI currently runs from source. To update, from the repo root run{" "}
          <code>git pull && pnpm install</code>, then restart <code>pnpm dev</code>.
        </p>
        <p>
          <strong>Your wiki data is safe across upgrades.</strong> The on-disk format
          (markdown + SQLite metadata) is unchanged from the project it derives from, so your
          folder, schema, pages, chats and history carry over. Database changes are additive and
          run automatically on the next server start.
        </p>
      </Section>

      <Section
        id="troubleshooting"
        eyebrow="When things go sideways"
        title="Troubleshooting"
      >
        <ul className="space-y-3">
          <Trouble
            symptom="“OpenRouter API key not configured” (when not using Ollama)"
            fix="Open Settings → API and paste a key from openrouter.ai/keys. If you wanted to use local Ollama, make sure that Settings → Models has the provider for the active module set to Ollama."
          />
          <Trouble
            symptom="“server error from Ollama / LocalTunnel (502)” or connection hanging"
            fix="Your local Ollama instance on port 11434 is down or your LocalTunnel endpoint has disconnected/timed out. Make sure `ollama serve` is active and running on your local machine, and your `.env` has the correct `OLLAMA_BASE_URL`."
          />
          <Trouble
            symptom="“model not available on OpenRouter: anthropic/claude-3-5-sonnet”"
            fix="Providers retire models periodically. Settings → Models → switch the affected slot to a current model from the dropdown."
          />
          <Trouble
            symptom='"LLM response failed schema validation"'
            fix="The model returned malformed JSON. Click Ingest again — small models occasionally drift. If it keeps happening, switch the ingest slot to a smarter model (Sonnet, GPT-4o)."
          />
          <Trouble
            symptom="Lint keeps flagging the same fixed issue"
            fix="The page got edited but the index summary went stale. Click Rebuild index in Wiki health's Bulk fixes."
          />
          <Trouble
            symptom="Dev server feels slow / clicks not registering"
            fix="Dev-mode Next.js compiles routes lazily. First click to a route is slow; subsequent are fast. Loading skeletons should appear instantly — if they don't, refresh the browser."
          />
          <Trouble
            symptom="Standalone server crashes immediately after install with a native module error"
            fix={<>On Windows, use a Node LTS release (20 or 22) so prebuilt binaries exist for <code>better-sqlite3</code>; non-LTS Node versions force a C++ compile. Some Linux distros need build tools to compile <code>better-sqlite3</code> / <code>keytar</code> if no prebuilt binary matches. On Debian/Ubuntu: <code>sudo apt install build-essential python3 libsecret-1-dev</code>, then reinstall.</>}
          />
        </ul>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/about"
          className="rounded-md border border-border bg-card px-4 py-2 text-ui hover:border-primary/40 hover:bg-accent/40"
        >
          ← Back to About
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
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1 mb-4 font-display text-h2 font-semibold tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-body font-serif leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function Layer({ name, what }: { name: string; what: string }) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <code className="font-mono text-[13px] text-primary">{name}</code>
      <span className="ml-2 text-ui text-muted-foreground">— {what}</span>
    </li>
  );
}

function Op({ name, what }: { name: string; what: string }) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <span className="font-display text-h3 font-medium text-primary">
        {name}
      </span>
      <span className="ml-2 text-ui text-muted-foreground">— {what}</span>
    </li>
  );
}

function SubCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card p-4">
      <p className="font-display text-h3 font-medium tracking-tight">{title}</p>
      <div className="mt-1 text-ui text-muted-foreground">{children}</div>
    </div>
  );
}

function Trouble({
  symptom,
  fix,
}: {
  symptom: React.ReactNode;
  fix: React.ReactNode;
}) {
  return (
    <li className="rounded-md border border-border/70 bg-card p-3">
      <p className="font-medium">{symptom}</p>
      <p className="mt-1 text-ui text-muted-foreground">{fix}</p>
    </li>
  );
}

const TOC: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Mental model — three layers, three operations" },
  { id: "wikis", label: "Multiple wikis — switching + creating" },
  { id: "setup", label: "First-run: topic + API key" },
  { id: "sources", label: "Library — getting content in" },
  { id: "wiki", label: "The wiki — browsing your pages" },
  { id: "research", label: "Research — claims and evidence" },
  { id: "contradictions", label: "Contradictions — review" },
  { id: "evaluation", label: "Evaluation lab" },
  { id: "query", label: "Research vs Chats" },
  { id: "lint", label: "Lint — wiki health" },
  { id: "graph", label: "Graph — 3D network view" },
  { id: "dashboard", label: "Dashboard — stats across every wiki" },
  { id: "schema", label: "Schema — editing CLAUDE.md" },
  { id: "settings", label: "Settings — models, costs, key" },
  { id: "local-models", label: "Local models (Ollama) — separate setup guide" },
  { id: "disk", label: "Where everything lives on disk" },
  { id: "updating", label: "Updating to a new version" },
  { id: "troubleshooting", label: "Troubleshooting" },
];
