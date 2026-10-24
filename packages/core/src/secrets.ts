import { loadGlobalConfig, saveGlobalConfig, globalConfigPath } from "./config";

// OS keychain identifiers. The "service" namespace lets keytar coexist with
// other apps that use the system keychain.
const SERVICE = "llm-wiki";
const ACCOUNT = "openrouter";

/**
 * Server deployments have no OS keychain, so without this the key would be written to a plain-text
 * config file. When this variable is set, the key comes from the environment and is never stored.
 * It is deliberately NOT `OPENROUTER_API_KEY`: that name belongs to `pnpm eval --live`, and a shell
 * that has it exported must not silently change which key the app uses.
 */
export const API_KEY_ENV_VAR = "EVIDENCEGRAPH_OPENROUTER_API_KEY";

export type ApiKeySource = "env" | "keychain" | "config" | "none";

export type ApiKeyResult = {
  key: string | null;
  source: ApiKeySource;
  /**
   * True when keytar is usable on this host (surface a warning in the UI when false).
   * Not probed, and reported false, when the key comes from the environment.
   */
  keychainAvailable: boolean;
};

/** Thrown when something tries to save or remove a key that the environment owns. */
export class ApiKeyManagedByEnvError extends Error {
  constructor() {
    super(`The API key is provided by the ${API_KEY_ENV_VAR} environment variable. Change or remove it there.`);
    this.name = "ApiKeyManagedByEnvError";
  }
}

function apiKeyFromEnv(): string | null {
  const value = process.env[API_KEY_ENV_VAR]?.trim();
  return value ? value : null;
}

// Lazy-import keytar so a load failure (e.g. Linux without libsecret)
// degrades cleanly to file storage instead of crashing the whole app.
type KeytarModule = typeof import("keytar");
let keytarPromise: Promise<KeytarModule | null> | null = null;

async function loadKeytar(): Promise<KeytarModule | null> {
  if (keytarPromise) return keytarPromise;
  keytarPromise = (async () => {
    try {
      const mod = await import("keytar");
      // Round-trip a probe call: native modules can import but throw on use
      // when the OS service isn't running. Findings:
      //   - macOS Keychain: always available
      //   - Windows Credential Manager: always available
      //   - Linux: requires gnome-keyring or KWallet via libsecret
      await mod.findCredentials(SERVICE);
      return mod;
    } catch {
      return null;
    }
  })();
  return keytarPromise;
}

export async function isKeychainAvailable(): Promise<boolean> {
  return (await loadKeytar()) !== null;
}

export async function getApiKey(): Promise<ApiKeyResult> {
  const fromEnv = apiKeyFromEnv();
  if (fromEnv) return { key: fromEnv, source: "env", keychainAvailable: false };

  const keytar = await loadKeytar();
  if (keytar) {
    try {
      const key = await keytar.getPassword(SERVICE, ACCOUNT);
      if (key) return { key, source: "keychain", keychainAvailable: true };
    } catch {
      // fall through to config-file lookup
    }
  }
  const cfg = await loadGlobalConfig();
  if (cfg.openrouterKey) {
    return { key: cfg.openrouterKey, source: "config", keychainAvailable: keytar !== null };
  }
  return { key: null, source: "none", keychainAvailable: keytar !== null };
}

export async function setApiKey(key: string): Promise<ApiKeyResult> {
  if (!key.trim()) throw new Error("setApiKey: key must be non-empty");
  // Refuse before touching the keychain or the config file, so a server that gets its key from the
  // environment can never end up with a second copy on disk.
  if (apiKeyFromEnv()) throw new ApiKeyManagedByEnvError();
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, ACCOUNT, key);
      // Successful keychain write — purge any stale copy from config.json so
      // the key never lives in two places.
      const cfg = await loadGlobalConfig();
      if (cfg.openrouterKey) {
        const { openrouterKey: _drop, ...rest } = cfg;
        void _drop;
        await saveGlobalConfig({ ...rest, version: 1 });
      }
      return { key, source: "keychain", keychainAvailable: true };
    } catch {
      // fall through to config-file storage
    }
  }
  const cfg = await loadGlobalConfig();
  await saveGlobalConfig({ ...cfg, openrouterKey: key });
  return { key, source: "config", keychainAvailable: keytar !== null };
}

export async function deleteApiKey(): Promise<void> {
  if (apiKeyFromEnv()) throw new ApiKeyManagedByEnvError();
  const keytar = await loadKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE, ACCOUNT);
    } catch {
      // ignore — the key may not have been set via keychain
    }
  }
  const cfg = await loadGlobalConfig();
  if (cfg.openrouterKey) {
    const { openrouterKey: _drop, ...rest } = cfg;
    void _drop;
    await saveGlobalConfig({ ...rest, version: 1 });
  }
}

/**
 * For tests: reset the cached keytar promise so a fresh probe runs. Production
 * code never needs this.
 */
export function _resetKeytarCacheForTests(): void {
  keytarPromise = null;
}

export function fileFallbackPath(): string {
  return globalConfigPath();
}
