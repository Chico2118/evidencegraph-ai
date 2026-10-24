// Re-export the canonical Extracted* shapes from core. They live there because
// the ingest pipeline (in core) consumes them; ingestion is conceptually a
// downstream producer.
export type {
  ExtractedSource,
  ExtractedTextSource,
  ExtractedVisionSource,
  SourceFormat,
} from "@evidencegraph/core";

import type { ExtractedSource } from "@evidencegraph/core";

export function isTextSource(s: ExtractedSource): s is import("@evidencegraph/core").ExtractedTextSource {
  return s.kind === "text";
}

export function isVisionSource(
  s: ExtractedSource,
): s is import("@evidencegraph/core").ExtractedVisionSource {
  return s.kind === "vision";
}
