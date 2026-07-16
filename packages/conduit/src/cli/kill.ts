/**
 * `conduit kill` — emergency revoke-all.
 *
 *   1. Hit the control-plane to mark every session for this owner revoked
 *      (fast, takes effect on the next tool call).
 *   2. Surface a `revoke_session_key` sign-request the owner must approve in
 *      the dashboard. The CLI does NOT sign owner-grade instructions itself.
 */

import type { Command } from "commander";

export interface KillCommandOptions {
  readonly controlPlaneBaseUrl: string;
}

export function registerKillCommand(
  parent: Command,
  options: KillCommandOptions,
): void {
  parent
    .command("kill")
    .description(
      "Emergency: revoke every active Conduit session for a given owner.",
    )
    .requiredOption("--owner <pubkey>", "treasury owner pubkey")
    .option("--confirm", "actually do it (refuses without)", false)
    .action(async (opts: { owner: string; confirm?: boolean }) => {
      if (opts.confirm !== true) {
        process.stderr.write(
          `! conduit kill --owner ${opts.owner}\n` +
            "  This revokes ALL Conduit sessions for that owner.\n" +
            "  Re-run with --confirm to proceed.\n",
        );
        process.exit(2);
        return;
      }
      const res = await fetch(
        `${options.controlPlaneBaseUrl.replace(/\/$/, "")}/control-plane/kill/${opts.owner}`,
        { method: "POST" },
      );
      if (!res.ok) {
        process.stderr.write(`! control-plane responded ${res.status}\n`);
        process.exit(1);
        return;
      }
      const body = (await res.json()) as {
        revoked_count: number;
        on_chain_sign_request_id?: string;
      };
      process.stderr.write(
        `✓ Revoked ${body.revoked_count} Conduit sessions.\n` +
          (body.on_chain_sign_request_id !== undefined
            ? `  Open the dashboard and sign sign-request ${body.on_chain_sign_request_id} to revoke on-chain too.\n`
            : "  (No on-chain sign-request created — all sessions were already revoked.)\n"),
      );
    });
}
