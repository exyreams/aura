/**
 * `conduit doctor` — diagnose the local Conduit stack.
 *
 * Checks (in order, never aborts on a single failure so the user sees all
 * problems at once):
 *   - control-plane HTTP gateway reachable + healthy
 *   - OpenAPI spec retrievable + lists the expected tools
 *   - keychain available + (optional) account has a token
 *   - Solana RPC reachable + responsive
 *   - SQLite DB openable at the configured path
 *
 * Exits 0 if everything passes, 1 otherwise.
 */

import type { Command } from "commander";

import { openConduitDb } from "../core/control-plane/db.js";
import { createKeychainStore } from "./keychain.js";

export interface DoctorOptions {
  readonly controlPlaneBaseUrl: string;
  readonly defaultRpcUrl: string;
  readonly defaultDbPath: string;
}

const REQUIRED_TOOLS = [
  "aura.whoami",
  "aura.instructions.list",
  "aura.instruction.describe",
  "aura.instruction.prepare",
  "aura.instruction.request_signature",
  "aura.treasury.get",
  "aura.policy.preview",
  "aura.session.status",
  "aura.activity.tail",
  "aura.proposal.list",
  "aura.proposal.get",
  "aura.proposal.create",
  "aura.proposal.cancel",
  "aura.execute.pending",
];

export function registerDoctorCommand(
  parent: Command,
  options: DoctorOptions,
): void {
  parent
    .command("doctor")
    .description(
      "Diagnose the local Conduit stack: HTTP, OpenAPI, keychain, RPC, DB.",
    )
    .option("--rpc-url <url>", "Solana RPC URL", options.defaultRpcUrl)
    .option("--account <name>", "check that a keychain account has a token")
    .option(
      "--db-path <path>",
      "SQLite DB path to probe",
      options.defaultDbPath,
    )
    .action(
      async (opts: { rpcUrl: string; account?: string; dbPath: string }) => {
        let failed = 0;
        const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

        // Control-plane
        try {
          const res = await fetch(
            `${options.controlPlaneBaseUrl.replace(/\/$/, "")}/healthz`,
          );
          const ok = res.ok;
          const body = ok ? ((await res.json()) as { ok?: boolean }) : null;
          checks.push({
            name: "control-plane /healthz",
            ok: ok && body?.ok === true,
            detail: ok ? "200 ok" : `HTTP ${res.status}`,
          });
        } catch (err) {
          checks.push({
            name: "control-plane /healthz",
            ok: false,
            detail: `unreachable: ${(err as Error).message}`,
          });
        }

        // OpenAPI + expected tools
        try {
          const res = await fetch(
            `${options.controlPlaneBaseUrl.replace(/\/$/, "")}/openapi.json`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const spec = (await res.json()) as {
            paths?: Record<string, unknown>;
          };
          const paths = Object.keys(spec.paths ?? {});
          const expected = REQUIRED_TOOLS.map(
            (t) => `/v1/${t.replace(/^aura\./, "").replace(/\./g, "/")}`,
          );
          const missing = expected.filter((p) => !paths.includes(p));
          checks.push({
            name: "openapi tool catalogue",
            ok: missing.length === 0,
            detail:
              missing.length === 0
                ? `all ${expected.length} tools present`
                : `missing: ${missing.join(", ")}`,
          });
        } catch (err) {
          checks.push({
            name: "openapi tool catalogue",
            ok: false,
            detail: `failed: ${(err as Error).message}`,
          });
        }

        // Keychain
        try {
          const store = createKeychainStore();
          if (opts.account !== undefined) {
            const token = store.get(opts.account);
            checks.push({
              name: `keychain (${opts.account})`,
              ok: token !== null,
              detail:
                token !== null ? `${token.slice(0, 12)}…` : "no token stored",
            });
          } else {
            const accounts = store.list();
            checks.push({
              name: "keychain",
              ok: true,
              detail: `${accounts.length} accounts: ${accounts.join(", ") || "(none)"}`,
            });
          }
        } catch (err) {
          checks.push({
            name: "keychain",
            ok: false,
            detail: `failed: ${(err as Error).message}`,
          });
        }

        // Solana RPC
        try {
          const res = await fetch(opts.rpcUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getHealth",
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as {
            result?: unknown;
            error?: { message?: string };
          };
          if (body.error !== undefined)
            throw new Error(body.error.message ?? "rpc error");
          checks.push({
            name: "Solana RPC",
            ok: true,
            detail: `${opts.rpcUrl} responded`,
          });
        } catch (err) {
          checks.push({
            name: "Solana RPC",
            ok: false,
            detail: `${opts.rpcUrl} unreachable: ${(err as Error).message}`,
          });
        }

        // SQLite
        try {
          const db = openConduitDb({ path: opts.dbPath });
          const row = db
            .prepare(`SELECT COUNT(*) AS n FROM sessions`)
            .get() as { n: number };
          db.close();
          checks.push({
            name: "SQLite DB",
            ok: true,
            detail: `${opts.dbPath} ok (${row.n} sessions)`,
          });
        } catch (err) {
          checks.push({
            name: "SQLite DB",
            ok: false,
            detail: `${opts.dbPath} failed: ${(err as Error).message}`,
          });
        }

        for (const check of checks) {
          const mark = check.ok ? "✓" : "✗";
          process.stdout.write(
            `${mark} ${check.name.padEnd(30)}  ${check.detail}\n`,
          );
          if (!check.ok) failed += 1;
        }
        process.exit(failed === 0 ? 0 : 1);
      },
    );
}
