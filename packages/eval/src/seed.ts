// Builds a real on-disk wiki (markdown pages, raw source files, SQLite rows,
// FTS index, page<->source lineage) from the synthetic fixtures. Shared by the
// live evaluation, the demo, and the end-to-end pipeline test, so all three
// exercise exactly the same data.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  indexPageForSearch,
  initWikiFolder,
  insertSource,
  linkPageSource,
  upsertPage,
  writePage,
  WIKI_PATHS,
  type Db,
} from "@evidencegraph/core";

import { loadFixtures, type Fixtures } from "./fixtures";

export async function seedWikiFromFixtures(wikiPath: string, db: Db, fixtures: Fixtures = loadFixtures()): Promise<void> {
  await initWikiFolder(wikiPath);
  const sourcesSeen = new Set<string>();

  for (const p of fixtures.corpus.pages) {
    await writePage(wikiPath, {
      slug: p.slug,
      frontmatter: {
        title: p.title,
        slug: p.slug,
        type: p.type,
        created: p.updated,
        updated: p.updated,
        sources: p.sources.map((s) => s.id),
      },
      content: p.content,
    });
    upsertPage(db, {
      slug: p.slug,
      title: p.title,
      type: p.type,
      created_at: p.updated,
      updated_at: p.updated,
      word_count: p.content.split(/\s+/).length,
      tags: [],
    });
    indexPageForSearch(db, { slug: p.slug, title: p.title, content: p.content, tags: [] });

    for (const s of p.sources) {
      if (!sourcesSeen.has(s.id)) {
        sourcesSeen.add(s.id);
        const filename = `${s.id}.md`;
        await writeFile(
          join(wikiPath, WIKI_PATHS.raw, filename),
          `# ${s.title}\n\nSynthetic source document. It stands in for the original file the wiki pages were compiled from; it contains no real research.\n`,
          "utf8",
        );
        insertSource(db, {
          id: s.id,
          filename,
          original_name: `${s.title}.${s.format}`,
          format: "md",
          size_bytes: 200,
          added_at: p.updated,
          ingested_at: p.updated,
          url: null,
          title: s.title,
        });
      }
      linkPageSource(db, p.slug, s.id);
    }
  }
}
