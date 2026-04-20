import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { runDashboard } from "../dashboard.js";
import { resolveTreasuryAccount } from "./helpers.js";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Launch the full-screen treasury dashboard")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--interval <secs>", "refresh interval in seconds", Number)
    .action(async function dashboardCommand() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const intervalMs =
        typeof options["interval"] === "number" && options["interval"] > 0
          ? Math.floor(options["interval"] * 1000)
          : 5000;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      await runDashboard({
        ctx,
        treasury: treasuryState.treasury,
        intervalMs,
      });
    });
}
