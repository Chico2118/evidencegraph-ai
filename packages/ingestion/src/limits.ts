// Input limits and sanitizers for untrusted ingestion input. Imported content
// is data, never instructions, and must not be able to exhaust memory or
// influence where a file is written.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per uploaded file
export const MAX_PASTED_TEXT_CHARS = 2_000_000; // ~2 MB of pasted text
export const MAX_URL_BODY_BYTES = 10 * 1024 * 1024; // 10 MB fetched page

const SAFE_EXT_RE = /^\.[a-z0-9]{1,8}$/;

/**
 * Returns a lowercase, allowlisted file extension (".pdf") or the fallback.
 * The extension becomes part of a file name on disk, so anything that is not
 * 1-8 alphanumerics after a dot is discarded rather than escaped.
 */
export function safeExtension(ext: string, fallback: string): string {
  const lowered = ext.toLowerCase();
  if (SAFE_EXT_RE.test(lowered)) return lowered;
  return fallback.startsWith(".") ? fallback : `.${fallback}`;
}

export class InputTooLargeError extends Error {
  readonly code = "INPUT_TOO_LARGE";
  constructor(what: string, limit: string) {
    super(`${what} is too large (limit ${limit}).`);
    this.name = "InputTooLargeError";
  }
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.round(n / 1024)} KB`;
}
