import { afterEach, describe, expect, it, vi } from "vitest";

import { ALLOW_PRIVATE_URLS_ENV, assertPublicUrl, isBlockedAddress, isUrlError, privateUrlsAllowed } from "./url-guard";
import { fetchAndExtractUrl } from "./url";

// None of these tests use the network or DNS: names are resolved by injected stubs and fetch is stubbed.

const BLOCKED = [
  "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254", "169.254.169.254",
  "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.0.0.5", "192.0.2.1", "198.18.0.1", "198.19.255.255",
  "198.51.100.9", "203.0.113.5", "224.0.0.1", "240.0.0.1", "255.255.255.255",
  "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "0:0:0:0:0:0:0:1",
  "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "fc00::1", "fd12:3456:789a::1", "ff02::1", "2001:db8::1",
  "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "100::1",
];
const ALLOWED = [
  "93.184.216.34", "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1",
  "192.169.0.1", "198.17.255.255", "198.20.0.1", "223.255.255.255",
  "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1",
];

describe("isBlockedAddress", () => {
  it.each(BLOCKED)("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(ALLOWED)("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it("fails closed on anything that is not an address", () => {
    for (const junk of ["", "localhost", "1.2.3", "1.2.3.256", "1.2.3.4.5", "::g", "1:2:3:4:5:6:7:8:9", ":::", "1::2::3"]) {
      expect(isBlockedAddress(junk)).toBe(true);
    }
  });
});

describe("assertPublicUrl", () => {
  afterEach(() => vi.unstubAllEnvs());
  const publicOnly = { resolveHost: async () => ["93.184.216.34"] };

  it("allows a name that resolves to public addresses only", async () => {
    await expect(assertPublicUrl(new URL("https://example.com/a"), publicOnly)).resolves.toBeUndefined();
  });

  it("blocks literal private addresses, including the odd spellings URL normalises", async () => {
    for (const u of [
      "http://127.0.0.1:3000/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/",
      "http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://[::ffff:127.0.0.1]/", "http://192.168.0.1/",
    ]) {
      await expect(assertPublicUrl(new URL(u), publicOnly), u).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    }
  });

  it("blocks a name that resolves to a private address, and a name that resolves to a mix", async () => {
    const toLoopback = { resolveHost: async () => ["127.0.0.1"] };
    const mixed = { resolveHost: async () => ["93.184.216.34", "10.0.0.7"] };
    await expect(assertPublicUrl(new URL("http://localhost/"), toLoopback)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    await expect(assertPublicUrl(new URL("http://rebind.example/"), mixed)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });

  it("explains the block and names the opt-out variable", async () => {
    const err = await assertPublicUrl(new URL("http://127.0.0.1/"), publicOnly).catch((e: unknown) => e);
    expect((err as Error).message).toContain(ALLOW_PRIVATE_URLS_ENV);
  });

  it("reports a name that does not resolve as a fetch failure, not a block", async () => {
    const failing = { resolveHost: async () => { throw new Error("ENOTFOUND"); } };
    const none = { resolveHost: async () => [] };
    await expect(assertPublicUrl(new URL("http://nope.invalid/"), failing)).rejects.toMatchObject({ code: "FETCH_FAILED" });
    await expect(assertPublicUrl(new URL("http://nope.invalid/"), none)).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });

  it("the opt-out skips the check, and does not even resolve the name", async () => {
    const resolveHost = vi.fn(async () => ["127.0.0.1"]);
    await expect(assertPublicUrl(new URL("http://localhost/"), { resolveHost, allowPrivate: true })).resolves.toBeUndefined();
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("reads the opt-out from the environment, and only the exact value 1", async () => {
    vi.stubEnv(ALLOW_PRIVATE_URLS_ENV, "1");
    expect(privateUrlsAllowed()).toBe(true);
    await expect(assertPublicUrl(new URL("http://127.0.0.1/"))).resolves.toBeUndefined();
    for (const v of ["", "0", "true", "yes", "on"]) {
      vi.stubEnv(ALLOW_PRIVATE_URLS_ENV, v);
      expect(privateUrlsAllowed(), v).toBe(false);
    }
  });
});

describe("fetchAndExtractUrl address and redirect checks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const publicHost = { resolveHost: async () => ["93.184.216.34"] };
  const html = (body: string) =>
    new Response(`<html><head><title>T</title></head><body><article><p>${body}</p></article></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

  it("never sends a request to a private address by default", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAndExtractUrl("http://127.0.0.1:3000/", publicHost)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    await expect(fetchAndExtractUrl("http://169.254.169.254/latest/meta-data/", publicHost)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks a public page that redirects to a private address, after exactly one request", async () => {
    const fetchSpy = vi.fn(async () => redirect("http://169.254.169.254/latest/meta-data/"));
    vi.stubGlobal("fetch", fetchSpy);
    // The injected resolver says every NAME is public; the redirect target is an IP literal, which is checked directly.
    await expect(fetchAndExtractUrl("https://example.com/start", publicHost)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a name that resolves privately", async () => {
    const resolveHost = vi.fn(async (h: string) => (h === "internal.example" ? ["10.0.0.9"] : ["93.184.216.34"]));
    const fetchSpy = vi.fn(async () => redirect("https://internal.example/admin"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAndExtractUrl("https://example.com/", { resolveHost })).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("follows a normal redirect, resolving a relative Location against the current page", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init: RequestInit) => {
        urls.push(u);
        expect(init.redirect).toBe("manual"); // redirects are never delegated to fetch
        return urls.length === 1 ? redirect("/final") : html("Hello from the final page.");
      }),
    );
    const out = await fetchAndExtractUrl("https://example.com/start", publicHost);
    expect(urls).toEqual(["https://example.com/start", "https://example.com/final"]);
    expect(JSON.stringify(out)).toContain("Hello from the final page");
  });

  it("stops after 5 redirects", async () => {
    const fetchSpy = vi.fn(async () => redirect("https://example.com/again"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAndExtractUrl("https://example.com/", publicHost)).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(fetchSpy).toHaveBeenCalledTimes(6); // the original request plus five followed redirects
  });

  it("refuses a redirect to a non-http scheme and to a malformed target", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => redirect("file:///etc/passwd")));
    await expect(fetchAndExtractUrl("https://example.com/", publicHost)).rejects.toMatchObject({ code: "INVALID_URL" });
    vi.stubGlobal("fetch", vi.fn(async () => redirect("http://[::1")));
    await expect(fetchAndExtractUrl("https://example.com/", publicHost)).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });

  it("a 3xx without a Location header is reported as an HTTP error, not followed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 304 })));
    await expect(fetchAndExtractUrl("https://example.com/", publicHost)).rejects.toMatchObject({ code: "HTTP_ERROR" });
  });

  it("the opt-out (option or environment variable) lets a local address through", async () => {
    const fetchSpy = vi.fn(async () => html("Local page."));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchAndExtractUrl("http://127.0.0.1:8080/doc", { allowPrivate: true })).resolves.toBeDefined();
    vi.stubEnv(ALLOW_PRIVATE_URLS_ENV, "1");
    await expect(fetchAndExtractUrl("http://192.168.1.20/doc")).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("still reports a transport failure as FETCH_FAILED with the URL, and keeps our own error codes intact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const err = await fetchAndExtractUrl("https://example.com/x", publicHost).catch((e: unknown) => e);
    expect(isUrlError(err)).toBe(true);
    expect(err).toMatchObject({ code: "FETCH_FAILED" });
    expect((err as Error).message).toContain("https://example.com/x");

    // An aborted fetch carries a numeric `code` (a DOMException): it must be wrapped, not passed through as-is.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    await expect(fetchAndExtractUrl("https://example.com/x", publicHost)).rejects.toMatchObject({ code: "FETCH_FAILED" });
  });
});
