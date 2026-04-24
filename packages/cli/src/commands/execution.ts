import BN from "bn.js";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import {
  createTable,
  emitJson,
  printBanner,
  printSuccess,
  serializeInstruction,
  startSpinner,
} from "../output.js";
import {
  buildMessageDigestHex,
  deriveApprovedExecutionAccounts,
  getMessageApprovalState,
  parseCiphertextVerified,
  parseDecryptionReady,
  resolvePendingProposal,
  sendInstructionsWithBudget,
  waitForMessageApproval,
} from "../protocol.js";
import { requestDwalletSign } from "../ika.js";
import type { TreasuryAccountRecord } from "../sdk.js";
import { renderTreasurySections } from "../treasury-view.js";
import { resolveTreasuryAccount } from "./helpers.js";

function buildExecutePendingInstruction(options: {
  ctx: ReturnType<typeof buildCliContext>;
  treasury: PublicKey;
  now: number;
  approvedAccounts?: ReturnType<typeof deriveApprovedExecutionAccounts>;
}): TransactionInstruction {
  const keys: AccountMeta[] = [
    { pubkey: options.ctx.wallet!.publicKey, isSigner: true, isWritable: false },
    { pubkey: options.treasury, isSigner: false, isWritable: true },
  ];

  if (options.approvedAccounts) {
    keys.push(
      {
        pubkey: options.approvedAccounts.messageApproval,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: options.approvedAccounts.dwalletAccount,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: options.ctx.programId, isSigner: false, isWritable: false },
      {
        pubkey: options.approvedAccounts.cpiAuthority,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: options.approvedAccounts.dwalletProgram,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: options.approvedAccounts.dwalletCoordinator,
        isSigner: false,
        isWritable: false,
      },
    );
  } else {
    keys.push({ pubkey: options.ctx.programId, isSigner: false, isWritable: false });
  }

  keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });

  return new TransactionInstruction({
    programId: options.ctx.programId,
    keys,
    data: options.ctx.client.coder.encode("executePending", {
      now: new BN(options.now),
    }),
  });
}

async function renderExecutionWatch(
  ctx: ReturnType<typeof buildCliContext>,
  treasury: PublicKey,
  account: TreasuryAccountRecord,
): Promise<void> {
  const sections = renderTreasurySections(treasury, account);
  const live = createTable(["Live check", "Value"]);
  const pending = account.pending;

  if (pending?.policyOutputCiphertextAccount) {
    const policyOutput = new PublicKey(pending.policyOutputCiphertextAccount);
    const info = await ctx.connection.getAccountInfo(policyOutput, "confirmed");
    live.push(["Policy output verified", parseCiphertextVerified(info) ? "Yes" : "No"]);
  }

  if (pending?.decryptionRequest?.requestAccount) {
    const requestAccount = new PublicKey(pending.decryptionRequest.requestAccount);
    const info = await ctx.connection.getAccountInfo(requestAccount, "confirmed");
    live.push(["Decryption ready", parseDecryptionReady(info) ? "Yes" : "No"]);
  }

  if (pending?.signatureRequest?.messageApprovalAccount) {
    const messageApproval = new PublicKey(pending.signatureRequest.messageApprovalAccount);
    const state = await getMessageApprovalState(ctx.connection, messageApproval);
    live.push(["Message approval", state]);
  }

  printBanner(ctx.output, `Execution Watch: ${account.agentId}`);
  if (sections.pending) {
    console.log(sections.pending);
  } else {
    console.log("No pending proposal.");
  }
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
    .option("--wait", "wait until message approval exists (approved) or pending clears (denied)")
    .option("--wait-signed", "wait until the message approval reaches signed status")
    .action(async function executionExecute() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to execute pending proposals.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const pending = resolvePendingProposal(treasuryState.account);
      const approvedAccounts = pending.decision.approved
        ? deriveApprovedExecutionAccounts(treasuryState.account, {
          auraProgramId: ctx.programId,
        })
        : undefined;
      const now = Math.floor(Date.now() / 1000);
      const instruction = buildExecutePendingInstruction({
        ctx,
        treasury: treasuryState.treasury,
        now,
        approvedAccounts,
      });

      if (ctx.dryRun) {
        emitJson(ctx.output, {
          action: "execution.execute",
          treasury: treasuryState.treasury,
          approved: pending.decision.approved,
          messageApproval: approvedAccounts?.messageApproval,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(
        ctx.output,
        pending.decision.approved
          ? "Submitting execute_pending for live dWallet signing..."
          : "Submitting denial execution...",
      );
      const signature = await sendInstructionsWithBudget({
        connection: ctx.connection,
        payer: ctx.wallet,
        instructions: [instruction],
      });

      if (pending.decision.approved && approvedAccounts && options["waitSigned"] === true) {
        spinner.setText("Waiting for message approval signature...");
        await waitForMessageApproval(
          ctx.connection,
          approvedAccounts.messageApproval,
          "signed",
          { timeoutMs: 180_000 },
        );
      } else if (pending.decision.approved && approvedAccounts && options["wait"] === true) {
        spinner.setText("Waiting for message approval account...");
        await waitForMessageApproval(
          ctx.connection,
          approvedAccounts.messageApproval,
          "pending",
          { timeoutMs: 120_000 },
        );

        // Drive the dWallet presign + sign flow via the Ika gRPC network
        spinner.setText("Requesting dWallet presign + sign via Ika network...");
        try {
          const messageDigest = Buffer.from(
            buildMessageDigestHex(approvedAccounts.pending, approvedAccounts.dwallet),
            "hex",
          );
          const txSigBytes = Buffer.from(
            Buffer.from(signature, "base64").length === 64
              ? Buffer.from(signature, "base64")
              : Buffer.alloc(64), // fallback for non-base64 signatures
          );
          await requestDwalletSign(
            ctx.wallet.publicKey,
            approvedAccounts.dwalletAccount,
            messageDigest,
            txSigBytes,
          );
          spinner.setText("Waiting for message approval to be signed...");
          await waitForMessageApproval(
            ctx.connection,
            approvedAccounts.messageApproval,
            "signed",
            { timeoutMs: 180_000 },
          );
        } catch (err) {
          // Non-fatal — the message approval may already be signed or the
          // dWallet network may process it asynchronously
          spinner.setText(`dWallet sign request: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      spinner.succeed("Execution request submitted");

      const refreshed = await ctx.client.getTreasuryAccount(treasuryState.treasury);
      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          signature,
          approved: pending.decision.approved,
          messageApproval: approvedAccounts?.messageApproval,
          pending: refreshed.pending,
        });
        return;
      }

      if (!pending.decision.approved && !refreshed.pending) {
        printSuccess(ctx.output, `Denied proposal cleared: ${signature}`);
        return;
      }

      printSuccess(
        ctx.output,
        pending.decision.approved
          ? `Execution request submitted: ${signature}`
          : `Execution request submitted: ${signature}`,
      );
    });

  execution
    .command("finalize")
    .description("Finalize an approved proposal after dWallet signing")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--message-approval <pubkey>", "override the pending message approval account")
    .action(async function executionFinalize() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to finalize execution.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const pending = resolvePendingProposal(treasuryState.account);
      const messageApproval =
        typeof options["messageApproval"] === "string"
          ? new PublicKey(options["messageApproval"])
          : pending.signatureRequest?.messageApprovalAccount
            ? new PublicKey(pending.signatureRequest.messageApprovalAccount)
            : undefined;
      if (!messageApproval) {
        throw new Error("No message approval account is available for finalize_execution.");
      }
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.finalizeExecutionInstruction(
          {
            operator: ctx.wallet.publicKey,
            treasury: treasuryState.treasury,
            messageApproval,
          },
          now,
        );
        emitJson(ctx.output, {
          action: "execution.finalize",
          treasury: treasuryState.treasury,
          messageApproval,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Finalizing execution...");
      const signature = await ctx.client.finalizeExecution(
        ctx.wallet,
        {
          operator: ctx.wallet.publicKey,
          treasury: treasuryState.treasury,
          messageApproval,
        },
        now,
      );
      const refreshed = await ctx.client.getTreasuryAccount(treasuryState.treasury);
      spinner.succeed("Execution finalized");

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          signature,
          totalTransactions: refreshed.totalTransactions,
          pending: refreshed.pending,
        });
        return;
      }

      printSuccess(
        ctx.output,
        `Execution finalized: ${signature} (total tx ${refreshed.totalTransactions})`,
      );
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
        typeof options["interval"] === "number" && options["interval"] > 0
          ? Math.floor(options["interval"] * 1000)
          : 5000;

      while (true) {
        const treasuryState = await resolveTreasuryAccount(ctx, {
          agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
          treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
        });
        if (!ctx.output.json) {
          console.clear();
        }
        await renderExecutionWatch(ctx, treasuryState.treasury, treasuryState.account);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    });
}
