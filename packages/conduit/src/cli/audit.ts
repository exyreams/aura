/**
 * `conduit audit` subcommands.
 *
 *   verify  — walks the hash-chained audit log, returns `ok`/`broken_at`
 *   anchor  — computes the current Merkle root and produces a sign-request the
 *             owner approves in the dashboard to publish on-chain
 *   tail    — prints the last N entries (for ops/debug)
 */

import type { Command } from "commander";

import { HashChainedAuditLog } from "../core/control-plane/audit-log.js";
import { defaultDbPath, openConduitDb } from "../core/control-plane/db.js";

export interface AuditOptions {
  readonly controlPlaneBaseUrl: string;
}

export function registerAuditCommands(
  parent: Command,
  options: AuditOptions,
): void {
  const audit = parent
    .command("audit")
    .description("Audit log: verify, anchor, tail");

  audit
    .command("verify")
    .description("Walk the hash chain; report integrity status.")
    .option("--db-path <path>", "SQLite DB path", defaultDbPath())
    .action(async (opts: { dbPath: string }) => {
      const db = openConduitDb({ path: opts.dbPath });
      const log = new HashChainedAuditLog(db);
      const result = log.verify();
      db.close();
      if (result.ok) {
        process.stdout.write(`✓ audit chain intact\n`);
        return;
      }
      process.stderr.write(
        `✗ audit chain broken at seq=${result.brokenAt}\n` +
          `  expected: ${result.expected}\n` +
          `  actual:   ${result.actual}\n`,
      );
      process.exit(1);
    });

  audit
    .command("anchor")
    .description(
      "Compute the current Merkle root and post a sign-request for the owner to publish it on-chain.",
    )
    .requiredOption("--owner <pubkey>", "treasury owner pubkey")
    .option("--db-path <path>", "SQLite DB path", defaultDbPath())
    .action(async (opts: { owner: string; dbPath: string }) => {
      const db = openConduitDb({ path: opts.dbPath });
      const log = new HashChainedAuditLog(db);
      const root = log.rootHash();
      db.close();
      const res = await fetch(
        `${options.controlPlaneBaseUrl.replace(/\/$/, "")}/control-plane/sign-requests`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner_pubkey: opts.owner,
            instruction_name: "audit_anchor",
            unsigned_tx_b64: "", // dashboard builds the actual memo/tx
            decoded_summary: {
              action: "audit_anchor",
              root,
              recorded_at: Date.now(),
            },
            caller_id: "conduit-audit-cli",
            ttl_secs: 600,
          }),
        },
      );
      if (!res.ok) {
        process.stderr.write(`! control-plane responded ${res.status}\n`);
        process.exit(1);
        return;
      }
      const body = (await res.json()) as { sign_request_id?: string };
      process.stdout.write(
        `✓ Anchor sign-request created: ${body.sign_request_id ?? "(unknown id)"}\n` +
          `  Open the dashboard to publish root: ${root}\n`,
      );
    });

  audit
    .command("tail")
    .description("Print the last N audit entries.")
    .option(
      "--limit <n>",
      "number of entries",
      (v: string) => Number.parseInt(v, 10),
      20,
    )
    .option("--db-path <path>", "SQLite DB path", defaultDbPath())
    .action(async (opts: { limit: number; dbPath: string }) => {
      const db = openConduitDb({ path: opts.dbPath });
      const log = new HashChainedAuditLog(db);
      const entries = log.tail(opts.limit);
      db.close();
      for (const entry of entries) {
        process.stdout.write(`${JSON.stringify(entry)}\n`);
      }
    });
}
