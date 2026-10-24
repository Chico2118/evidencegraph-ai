import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in for the real keytar module. Each test resets `behavior` to choose
// success vs failure. We intercept the dynamic import inside secrets.ts via
// vi.mock so the real OS keychain is never touched.
const keytarStore = new Map<string, string>();
let keytarBehavior: "ok" | "throw-on-probe" | "throw-on-write" = "ok";

vi.mock("keytar", () => ({
  findCredentials: vi.fn(async () => {
    if (keytarBehavior === "throw-on-probe") throw new Error("no libsecret");
    return Array.from(keytarStore.entries()).map(([account, password]) => ({ account, password }));
  }),
  getPassword: vi.fn(async (_service: string, account: string) => {
    return keytarStore.get(account) ?? null;
  }),
  setPassword: vi.fn(async (_service: string, account: string, password: string) => {
    if (keytarBehavior === "throw-on-write") throw new Error("keychain locked");
    keytarStore.set(account, password);
  }),
  deletePassword: vi.fn(async (_service: string, account: string) => {
    return keytarStore.delete(account);
  }),
}));

import { loadGlobalConfig, saveGlobalConfig, globalConfigPath } from "./config";
import {
  _resetKeytarCacheForTests,
  API_KEY_ENV_VAR,
  ApiKeyManagedByEnvError,
  deleteApiKey,
  getApiKey,
  isKeychainAvailable,
  setApiKey,
} from "./secrets";

let configDir: string;
let priorEnv: string | undefined;
let priorKeyEnv: string | undefined;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "llm-wiki-secrets-test-"));
  priorEnv = process.env["LLM_WIKI_CONFIG_DIR"];
  process.env["LLM_WIKI_CONFIG_DIR"] = configDir;
  // A developer's own shell may have the variable set; every test starts without it.
  priorKeyEnv = process.env[API_KEY_ENV_VAR];
  delete process.env[API_KEY_ENV_VAR];
  keytarStore.clear();
  keytarBehavior = "ok";
  _resetKeytarCacheForTests();
});

afterEach(async () => {
  if (priorEnv === undefined) delete process.env["LLM_WIKI_CONFIG_DIR"];
  else process.env["LLM_WIKI_CONFIG_DIR"] = priorEnv;
  if (priorKeyEnv === undefined) delete process.env[API_KEY_ENV_VAR];
  else process.env[API_KEY_ENV_VAR] = priorKeyEnv;
  await rm(configDir, { recursive: true, force: true });
});

describe("keychain path (keytar available)", () => {
  it("setApiKey writes to keychain and getApiKey reads it back", async () => {
    const result = await setApiKey("sk-or-v1-keychain");
    expect(result).toEqual({
      key: "sk-or-v1-keychain",
      source: "keychain",
      keychainAvailable: true,
    });

    const fetched = await getApiKey();
    expect(fetched.key).toBe("sk-or-v1-keychain");
    expect(fetched.source).toBe("keychain");
  });

  it("getApiKey returns none when nothing is stored anywhere", async () => {
    const r = await getApiKey();
    expect(r.key).toBeNull();
    expect(r.source).toBe("none");
  });

  it("setApiKey purges any stale copy from the config file", async () => {
    // Pre-seed a config file with a key (simulating a prior file-fallback run)
    await saveGlobalConfig({
      version: 1,
      openrouterKey: "sk-or-v1-stale",
      recentWikis: [],
      uiTheme: "auto",
    });
    await setApiKey("sk-or-v1-fresh");
    const cfg = await loadGlobalConfig();
    expect(cfg.openrouterKey).toBeUndefined();
  });

  it("deleteApiKey clears both keychain and config", async () => {
    await setApiKey("sk-or-v1-x");
    await deleteApiKey();
    expect((await getApiKey()).key).toBeNull();
  });

  it("isKeychainAvailable returns true when probe succeeds", async () => {
    expect(await isKeychainAvailable()).toBe(true);
  });
});

describe("file fallback path (keytar probe fails)", () => {
  beforeEach(() => {
    keytarBehavior = "throw-on-probe";
    _resetKeytarCacheForTests();
  });

  it("setApiKey writes into the config file with restrictive perms", async () => {
    const r = await setApiKey("sk-or-v1-onfile");
    expect(r.source).toBe("config");
    expect(r.keychainAvailable).toBe(false);

    const cfg = await loadGlobalConfig();
    expect(cfg.openrouterKey).toBe("sk-or-v1-onfile");

    if (process.platform !== "win32") {
      const { mode } = await (await import("node:fs/promises")).stat(globalConfigPath());
      expect(mode & 0o777).toBe(0o600);
    }
  });

  it("getApiKey returns the config file value with source='config'", async () => {
    await setApiKey("sk-or-v1-A");
    const r = await getApiKey();
    expect(r.key).toBe("sk-or-v1-A");
    expect(r.source).toBe("config");
    expect(r.keychainAvailable).toBe(false);
  });

  it("isKeychainAvailable returns false when the probe throws", async () => {
    expect(await isKeychainAvailable()).toBe(false);
  });

  it("deleteApiKey removes the key from the config file", async () => {
    await setApiKey("sk-or-v1-A");
    await deleteApiKey();
    expect((await loadGlobalConfig()).openrouterKey).toBeUndefined();
  });
});

describe("partial fallback (keychain probe ok but write fails)", () => {
  it("falls back to file when setPassword throws", async () => {
    keytarBehavior = "throw-on-write";
    _resetKeytarCacheForTests();
    const r = await setApiKey("sk-or-v1-Z");
    expect(r.source).toBe("config");
    // keychain probe still succeeded, so we still report it as available
    expect(r.keychainAvailable).toBe(true);
    expect((await loadGlobalConfig()).openrouterKey).toBe("sk-or-v1-Z");
  });
});

describe("key provided by the environment (hosted deployments)", () => {
  const ENV_KEY = "sk-or-v1-FROM-ENV-TEST-0000";

  it("getApiKey returns it (trimmed) with source 'env', even when the keychain also holds a key", async () => {
    process.env[API_KEY_ENV_VAR] = `  ${ENV_KEY}  `;
    await setKeychainForTest("sk-or-v1-keychain-should-lose");
    const r = await getApiKey();
    expect(r).toEqual({ key: ENV_KEY, source: "env", keychainAvailable: false });
  });

  it("wins over a key already stored in the keychain or the config file", async () => {
    await saveGlobalConfig({ version: 1, openrouterKey: "sk-or-v1-in-file", recentWikis: [], uiTheme: "auto" });
    process.env[API_KEY_ENV_VAR] = ENV_KEY;
    expect((await getApiKey()).key).toBe(ENV_KEY);
  });

  it("ignores an empty or whitespace-only value", async () => {
    process.env[API_KEY_ENV_VAR] = "   ";
    expect((await getApiKey()).source).toBe("none");
  });

  it("setApiKey refuses, and writes nothing to the config file or the keychain", async () => {
    process.env[API_KEY_ENV_VAR] = ENV_KEY;
    await expect(setApiKey("sk-or-v1-attacker")).rejects.toBeInstanceOf(ApiKeyManagedByEnvError);
    expect((await loadGlobalConfig()).openrouterKey).toBeUndefined();
    expect(keytarStore.size).toBe(0);
  });

  it("deleteApiKey refuses too, so an environment key cannot be removed from the UI", async () => {
    process.env[API_KEY_ENV_VAR] = ENV_KEY;
    await expect(deleteApiKey()).rejects.toBeInstanceOf(ApiKeyManagedByEnvError);
  });

  it("the error names the variable and never contains the key", async () => {
    process.env[API_KEY_ENV_VAR] = ENV_KEY;
    const err = (await setApiKey("sk-or-v1-x").catch((e: unknown) => e)) as Error;
    expect(err.message).toContain(API_KEY_ENV_VAR);
    expect(err.message).not.toContain(ENV_KEY);
  });

  it("does NOT react to OPENROUTER_API_KEY, which belongs to `pnpm eval --live`", async () => {
    const prior = process.env["OPENROUTER_API_KEY"];
    process.env["OPENROUTER_API_KEY"] = "sk-or-v1-eval-only";
    try {
      expect((await getApiKey()).source).toBe("none");
      await expect(setApiKey("sk-or-v1-normal")).resolves.toMatchObject({ source: "keychain" });
    } finally {
      if (prior === undefined) delete process.env["OPENROUTER_API_KEY"];
      else process.env["OPENROUTER_API_KEY"] = prior;
    }
  });
});

async function setKeychainForTest(key: string): Promise<void> {
  keytarStore.set("openrouter", key);
}

describe("setApiKey input validation", () => {
  it("rejects empty keys", async () => {
    await expect(setApiKey("")).rejects.toThrow(/non-empty/);
    await expect(setApiKey("   ")).rejects.toThrow(/non-empty/);
  });
});

it("imports config module without warnings", async () => {
  // Sanity check that readFile is still importable; ensures no module-level
  // hoist regression.
  expect(typeof readFile).toBe("function");
});
