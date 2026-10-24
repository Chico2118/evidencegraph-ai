import { afterEach, describe, expect, it, vi } from "vitest";

import { InputTooLargeError, MAX_URL_BODY_BYTES, safeExtension } from "./limits";
import { fetchAndExtractUrl } from "./url";

describe("safeExtension", () => {
  it("keeps normal extensions, lowercased", () => {
    expect(safeExtension(".PDF", "txt")).toBe(".pdf");
    expect(safeExtension(".md", "txt")).toBe(".md");
  });

  it("falls back for anything that could influence a path", () => {
    for (const bad of ["", ".", "..", "./x", ".a/b", ".a\\b", ".exe;rm", ".verylongextension", "pdf", ".p df"]) {
      expect(safeExtension(bad, "txt")).toBe(".txt");
    }
    expect(safeExtension("bad", ".md")).toBe(".md");
  });
});

// These tests exercise size limits, not DNS: resolve every name to a public address without a lookup.
const publicHost = { resolveHost: async () => ["93.184.216.34"] };

describe("fetchAndExtractUrl guards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects non-http(s) schemes and garbage before any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "not a url"]) {
      await expect(fetchAndExtractUrl(url)).rejects.toThrow();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a page whose declared size is over the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": String(MAX_URL_BODY_BYTES + 1) },
        }),
      ),
    );
    await expect(fetchAndExtractUrl("https://example.com/big", publicHost)).rejects.toBeInstanceOf(InputTooLargeError);
  });

  it("rejects a page that exceeds the limit even without a content-length header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array(MAX_URL_BODY_BYTES + 10), { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );
    await expect(fetchAndExtractUrl("https://example.com/sneaky", publicHost)).rejects.toBeInstanceOf(InputTooLargeError);
  });
});
