// Keeps URL ingestion from reaching private or local network addresses (SSRF).
//
// A hosted copy of the app would otherwise let anyone who can reach it make the server fetch
// internal services or a cloud provider's metadata endpoint (169.254.169.254). Local-first users
// who really do want to ingest a page from their own machine or network can opt out with
// EVIDENCEGRAPH_ALLOW_PRIVATE_URLS=1.
//
// Limits, stated plainly: the hostname is resolved and checked just before each request, and a
// hostile DNS server could still answer differently when the connection is made (DNS rebinding).
// Closing that needs a custom connector, which would be a new dependency, so it is not done here.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ALLOW_PRIVATE_URLS_ENV = "EVIDENCEGRAPH_ALLOW_PRIVATE_URLS";

/** Resolves a hostname to every address it points at. Injectable so tests never touch DNS. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

export const resolveHostViaDns: ResolveHost = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

export type UrlErrorCode =
  | "INVALID_URL"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "BLOCKED_ADDRESS"
  | "TOO_MANY_REDIRECTS";

export function urlError(code: UrlErrorCode, message: string): Error & { code: UrlErrorCode } {
  return Object.assign(new Error(message), { code });
}

const URL_ERROR_CODES: readonly string[] = [
  "INVALID_URL",
  "FETCH_FAILED",
  "HTTP_ERROR",
  "UNSUPPORTED_CONTENT_TYPE",
  "BLOCKED_ADDRESS",
  "TOO_MANY_REDIRECTS",
] satisfies UrlErrorCode[];

/** True for errors made by urlError. (A DOMException from an aborted fetch also has a `code`, a number.) */
export function isUrlError(err: unknown): err is Error & { code: UrlErrorCode } {
  const code = (err as { code?: unknown } | null)?.code;
  return err instanceof Error && typeof code === "string" && URL_ERROR_CODES.includes(code);
}

export function privateUrlsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ALLOW_PRIVATE_URLS_ENV] === "1";
}

function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((n) => n >= 0 && n <= 255) ? octets : null;
}

/** Returns the 16 bytes of an IPv6 address, or null if it is not one. */
function parseIPv6(input: string): number[] | null {
  const text = input.split("%")[0] ?? ""; // drop a zone id such as fe80::1%eth0
  if (!text.includes(":")) return null;

  let tail: number[] = [];
  let head = text;
  const lastColon = text.lastIndexOf(":");
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail = v4;
    head = text.slice(0, lastColon + 1) + "0:0"; // placeholder hextets, replaced below
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;
  const toHextets = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const h of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };
  const left = toHextets(halves[0] ?? "");
  const right = halves.length === 2 ? toHextets(halves[1] ?? "") : [];
  if (!left || !right) return null;

  let hextets: number[];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    hextets = [...left, ...new Array<number>(missing).fill(0), ...right];
  } else {
    hextets = left;
  }
  if (hextets.length !== 8) return null;

  if (tail.length === 4) {
    hextets[6] = (tail[0]! << 8) | tail[1]!;
    hextets[7] = (tail[2]! << 8) | tail[3]!;
  }
  return hextets.flatMap((h) => [h >> 8, h & 0xff]);
}

function isBlockedIPv4(o: number[]): boolean {
  const [a, b, c] = [o[0]!, o[1]!, o[2]!];
  if (a === 0) return true; // "this network" and 0.0.0.0
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, includes the cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved and broadcast
  return false;
}

function isBlockedIPv6(bytes: number[]): boolean {
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((x) => x === 0);
  const v4 = (at: number) => isBlockedIPv4(bytes.slice(at, at + 4));

  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return v4(12); // ::ffff:a.b.c.d
  if (zeros(0, 12)) return true; // ::, ::1 and the deprecated IPv4-compatible form
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zeros(4, 12)) return v4(12); // NAT64
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return v4(2); // 6to4 embeds an IPv4 address
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true; // Teredo
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
  if (bytes[0] === 0x01 && zeros(1, 8)) return true; // discard-only 100::/64
  if ((bytes[0]! & 0xfe) === 0xfc) return true; // unique local fc00::/7
  if (bytes[0] === 0xfe) return true; // fe00::/8 holds only link-local, site-local and reserved ranges
  if (bytes[0] === 0xff) return true; // multicast
  return false;
}

/** True when `ip` is not an ordinary public address. Anything that does not parse is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedIPv6(v6);
  return true;
}

export type GuardOptions = {
  resolveHost?: ResolveHost | undefined;
  /** Defaults to the EVIDENCEGRAPH_ALLOW_PRIVATE_URLS environment variable. */
  allowPrivate?: boolean | undefined;
};

/** Throws if `url` points at a private or local address. Called before every request and redirect. */
export async function assertPublicUrl(url: URL, opts: GuardOptions = {}): Promise<void> {
  if (opts.allowPrivate ?? privateUrlsAllowed()) return;

  const host = url.hostname.replace(/^\[|\]$/g, ""); // URL keeps the brackets on IPv6 literals
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await (opts.resolveHost ?? resolveHostViaDns)(host);
    } catch (err) {
      throw urlError("FETCH_FAILED", `could not resolve ${host}: ${(err as Error).message}`);
    }
  }
  if (addresses.length === 0) throw urlError("FETCH_FAILED", `could not resolve ${host}`);

  // Every address must be public: a name that also points at a private address is refused.
  if (addresses.some(isBlockedAddress)) {
    throw urlError(
      "BLOCKED_ADDRESS",
      `${host} points at a private or local address, which is blocked. ` +
        `If you run EvidenceGraph AI only on your own machine and want this, set ${ALLOW_PRIVATE_URLS_ENV}=1.`,
    );
  }
}
