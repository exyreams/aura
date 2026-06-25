import {
  accounts,
  instructions,
  type TreasuryAccountRecord,
} from "@aura-protocol/sdk-ts";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import type { Command } from "commander";

import { buildCliContext, type CliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import {
  deriveApprovedExecutionAccounts,
  getActivePendingProposal,
  getMessageApprovalState,
  parseCiphertextVerified,
  parseDecryptionReady,
  resolvePendingProposal,
  waitForMessageApproval,
} from "../lib/protocol.js";
import { renderTreasurySections } from "../lib/treasury-view.js";
import {
  createTable,
  printBanner,
  printInfo,
  startSpinner,
} from "../ui/output.js";
import { resolveTreasuryAccount } from "./helpers.js";

async function renderExecutionWatch(
  ctx: CliContext,
  treasury: PublicKey,
  account: TreasuryAccountRecord,
): Promise<void> {
  const sections = renderTreasurySections(treasury, account);
  const live = createTable(["Live check", "Value"]);
  const pending = getActivePendingProposal(account);

  if (pending?.policyOutputCiphertextAccount) {
    const policyOutput = new PublicKey(pending.policyOutputCiphertextAccount);
    const info = await ctx.connection.getAccountInfo(policyOutput, "confirmed");
    live.push([
      "Policy output verified",
      parseCiphertextVerified(info) ? "Yes" : "No",
    ]);
  }
  if (pending?.decryptionRequest?.requestAccount) {
    const requestAccount = new PublicKey(
      pending.decryptionRequest.requestAccount,
    );
    const info = await ctx.connection.getAccountInfo(
      requestAccount,
      "confirmed",
    );
    live.push(["Decryption ready", parseDecryptionReady(info) ? "Yes" : "No"]);
  }
  if (pending?.signatureRequest?.messageApprovalAccount) {
    const messageApproval = new PublicKey(
      pending.signatureRequest.messageApprovalAccount,
    );
    const state = await getMessageApprovalState(
      ctx.connection,
      messageApproval,
    );
    live.push(["Message approval", state]);
  }

  printBanner(ctx.output, `Execution Watch: ${account.agentId}`);
  console.log(sections.pending ?? "No pending proposal.");
  if (live.length > 0) {
    console.log("");
    console.log(live.toString());
  }
}

export function registerExecutionCommands(program: Command): void {
  const execution = program
    .command("execution")
    .description("Drive pending proposal execution and finalization");

  execution
    .command("execute")
    .description("Run execute_pending for the current proposal")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--wait", "wait until the message approval account exists")
    .option(
      "--wait-signed",
      "wait until the message approval reaches signed status",
    )
    .action(async function executionExecute() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError(
          "A wallet is required to execute pending proposals.",
          {
            code: "WALLET_REQUIRED",
          },
        );
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const pending = resolvePendingProposal(treasuryState.account);
      const approved = pending.decision.approved;
      const approvedAccounts = approved
        ? deriveApprovedExecutionAccounts(treasuryState.account, {
            auraProgramId: ctx.programId,
          })
        : undefined;

      const instruction = await instructions.execution.executePending(
        ctx.client,
        {
          accounts: {
            operator: wallet.publicKey,
            treasury: treasuryState.treasury,
            messageApproval: approvedAccounts?.messageApproval ?? null,
            dwallet: approvedAccounts?.dwalletAccount ?? null,
            callerProgram: ctx.programId,
            cpiAuthority: approvedAccounts?.cpiAuthority ?? null,
            dwalletProgram: approvedAccounts?.dwalletProgram ?? null,
            dwalletCoordinator: approvedAccounts?.dwalletCoordinator ?? null,
            externalLiveness: null,
            dwalletState: null,
            systemProgram: SystemProgram.programId,
          },
          args: { now: new BN(Math.floor(Date.now() / 1000)) },
        },
      );

      const outcome = await runInstructions(ctx, [instruction], {
        action: approved
          ? "Execute pending (request dWallet signing)"
          : "Execute denial",
        instructionName: "execute_pending",
        summary: [
          ["decision", approved ? "approved" : "denied"],
          ...(approvedAccounts
            ? ([["approval", approvedAccounts.messageApproval.toBase58()]] as [
                string,
                string,
              ][])
            : []),
        ],
        result: {
          treasury: treasuryState.treasury,
          approved,
          messageApproval: approvedAccounts?.messageApproval,
        },
      });

      if (
        outcome.signature &&
        approvedAccounts &&
        (options.wait === true || options.waitSigned === true)
      ) {
        const target = options.waitSigned === true ? "signed" : "pending";
        const spinner = startSpinner(
          ctx.output,
          `Waiting for message approval (${target})...`,
        );
        try {
          await waitForMessageApproval(
            ctx.connection,
            approvedAccounts.messageApproval,
            target,
            {
              timeoutMs: 180_000,
            },
          );
          spinner.succeed(`Message approval ${target}`);
        } catch (error) {
          spinner.fail(`Timed out waiting for message approval (${target})`);
          throw error;
        }
      }
    });

  execution
    .command("finalize")
    .description("Finalize an approved proposal after dWallet signing")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option(
      "--message-approval <pubkey>",
      "override the pending message approval account",
    )
    .action(async function executionFinalize() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to finalize execution.", {
          code: "WALLET_REQUIRED",
        });
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
      });
      const pending = resolvePendingProposal(treasuryState.account);
      const messageApproval =
        typeof options.messageApproval === "string"
          ? new PublicKey(options.messageApproval)
          : pending.signatureRequest?.messageApprovalAccount
            ? new PublicKey(pending.signatureRequest.messageApprovalAccount)
            : undefined;
      if (!messageApproval) {
        throw new CliError(
          "No message approval account is available for finalize_execution.",
          {
            code: "NO_MESSAGE_APPROVAL",
            tip: "Run `aura execution execute --wait-signed` first, or pass --message-approval <pubkey>.",
          },
        );
      }

      const instruction = await instructions.execution.finalizeExecution(
        ctx.client,
        {
          accounts: {
            operator: wallet.publicKey,
            treasury: treasuryState.treasury,
            messageApproval,
            swarmPool: null,
            budgetEnvelope: null,
            exposureGroup: null,
            externalLiveness: null,
            dwalletState: null,
            scheduledIntent: null,
            feeVault: null,
            feeSchedule: null,
            protocolConfig: null,
          },
          args: { now: new BN(Math.floor(Date.now() / 1000)) },
        },
      );

      const outcome = await runInstructions(ctx, [instruction], {
        action: "Finalize execution",
        instructionName: "finalize_execution",
        summary: [["approval", messageApproval.toBase58()]],
        result: { treasury: treasuryState.treasury },
      });

      if (outcome.signature && !ctx.output.json) {
        try {
          const refreshed = await accounts.fetchTreasuryAccount(
            ctx.client,
            treasuryState.treasury,
          );
          printInfo(
            ctx.output,
            `total transactions: ${refreshed.totalTransactions}`,
          );
        } catch {
          // Non-fatal — confirmation already succeeded.
        }
      }
    });

  execution
    .command("watch")
    .description("Continuously watch one treasury's execution state")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--interval <secs>", "refresh interval in seconds", Number)
    .action(async function executionWatch() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const intervalMs =
        typeof options.interval === "number" && options.interval > 0
          ? Math.floor(options.interval * 1000)
          : 5000;

      for (;;) {
        const treasuryState = await resolveTreasuryAccount(ctx, {
          agentId:
            typeof options.agentId === "string" ? options.agentId : undefined,
          treasury:
            typeof options.treasury === "string" ? options.treasury : undefined,
        });
        if (!ctx.output.json) {
          console.clear();
        }
        await renderExecutionWatch(
          ctx,
          treasuryState.treasury,
          treasuryState.account,
        );
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    });
}
