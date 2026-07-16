/**
 * OS keychain wrapper for the `aurak_...` tokens. Uses `@napi-rs/keyring`
 * natively (macOS Keychain, Windows Credential Manager, Linux libsecret).
 * Falls back to a plaintext file under `~/.aura-conduit/` when the OS
 * keychain is unavailable — printed loudly so users notice.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Entry } from "@napi-rs/keyring";

const SERVICE = "aura-conduit";

export interface TokenStore {
  set(account: string, token: string): void;
  get(account: string): string | null;
  delete(account: string): boolean;
  list(): ReadonlyArray<string>;
}

export function createKeychainStore(): TokenStore {
  let useFallback = false;
  let fallback: FallbackStore | null = null;

  function ensureFallback(): FallbackStore {
    if (fallback === null) fallback = openFallback();
    return fallback;
  }

  function attempt<T>(fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      if (!useFallback) {
        process.stderr.write(
          `[aura-conduit] OS keychain unavailable (${(err as Error).message}); ` +
            "falling back to plaintext file at ~/.aura-conduit/tokens.json. " +
            "This is acceptable for dev only.\n",
        );
        useFallback = true;
      }
      throw err;
    }
  }

  return {
    set(account: string, token: string): void {
      try {
        attempt(() => new Entry(SERVICE, account).setPassword(token));
      } catch {
        ensureFallback().set(account, token);
      }
    },
    get(account: string): string | null {
      try {
        const value = attempt(() => new Entry(SERVICE, account).getPassword());
        if (typeof value === "string" && value.length > 0) return value;
        // Keychain had no entry — check fallback file (covers the case where
        // set() previously fell back to the file due to a keychain error).
        return ensureFallback().get(account);
      } catch {
        return ensureFallback().get(account);
      }
    },
    delete(account: string): boolean {
      try {
        return attempt(() => new Entry(SERVICE, account).deletePassword());
      } catch {
        return ensureFallback().delete(account);
      }
    },
    list(): ReadonlyArray<string> {
      // @napi-rs/keyring has no enumeration API. We track accounts in a tiny
      // sidecar file so `aura agent list` can show them. Loss of the sidecar
      // doesn't lose tokens — just the index. Re-login rebuilds it.
      return ensureFallback().list();
    },
  };
}

interface FallbackStore {
  set(account: string, token: string): void;
  get(account: string): string | null;
  delete(account: string): boolean;
  list(): ReadonlyArray<string>;
}

function openFallback(): FallbackStore {
  const dir = join(homedir(), ".aura-conduit");
  const path = join(dir, "tokens.json");
  function read(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  function write(data: Record<string, string>): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  }
  return {
    set(account, token) {
      const data = read();
      data[account] = token;
      write(data);
    },
    get(account) {
      const data = read();
      return data[account] ?? null;
    },
    delete(account) {
      const data = read();
      if (!(account in data)) return false;
      delete data[account];
      write(data);
      return true;
    },
    list() {
      return Object.keys(read()).sort();
    },
  };
}
