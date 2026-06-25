/**
 * The secure transaction pipeline shared by every command that writes
 * on-chain. Given built instructions and some metadata it will, in order:
 *
 *   1. assemble the transaction (compute-budget + optional heap frame),
 *   2. render a human preview of exactly what will be signed,
 *   3. guard production (mainnet) writes behind an explicit confirmation,
 *   4. confirm sensitive instructions (authority/governance/closures),
 *   5. preflight-simulate and surface compute units + program logs,
 *   6. sign, send, and confirm, printing the signature + explorer link.
 *
 * `--dry-run` stops after the preview and emits the serialized instructions.
 * `--json` suppresses decorative output and returns structured data.
 * `--yes` skips confirmations (for CI). `--no-simulate` skips preflight.
 */

import { confirm } from "@inquirer/prompts";
import {
  ComputeBudgetProgram,
  type Signer,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  emitJson,
  printNote,
  printPanel,
  printSuccess,
  serializeInstruction,
  startSpinner,
} from "../ui/output.js";
import { block, style, symbol } from "../ui/theme.js";
import type { CliContext } from "./context.js";
import { CliError } from "./errors.js";
import { classifyInstructionRisk, type RiskLevel } from "./security.js";

const DEFAULT_COMPUTE_UNIT_LIMIT = 600_000;

export interface RunMeta {
  /** Short action label, e.g. "Create treasury". */
  action: string;
  /** snake_case instruction name, used to classify risk. */
  instructionName?: string;
  /** Key/value rows summarizing the action, shown in the preview. */
  summary?: [string, string][];
  /** Additional signers beyond the fee-payer wallet. */
  extraSigners?: Signer[];
  /** Override the compute-unit limit. */
  computeUnits?: number;
  /** Request a heap-frame bump (confidential / large instructions). */
  heapFrameBytes?: number;
  /** Force a confirmation prompt regardless of risk classification. */
  confirm?: boolean;
  /** Extra fields merged into the JSON output on success. */
  result?: Record<string, unknown>;
}

export interface RunOutcome {
  dryRun: boolean;
  aborted: boolean;
  signature?: string;
}

function networkBadge(ctx: CliContext): string {
  const { kind, label } = ctx.network;
  if (kind === "mainnet") return block(label.toUpperCase(), "danger");
  if (kind === "devnet") return block(label, "success");
  if (kind === "localnet") return block(label, "muted");
  return block(label, "warn");
}

function explorerUrl(ctx: CliContext, signature: string): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  switch (ctx.network.kind) {
    case "mainnet":
      return base;
    case "devnet":
      return `${base}?cluster=devnet`;
    case "testnet":
      return `${base}?cluster=testnet`;
    default:
      return `${base}?cluster=custom&customUrl=${encodeURIComponent(ctx.network.rpcUrl)}`;
  }
}

function renderPreview(
  ctx: CliContext,
  instructions: TransactionInstruction[],
  meta: RunMeta,
): void {
  const lines: string[] = [];
  lines.push(
    `${style.muted("network")}   ${networkBadge(ctx)} ${style.dim(ctx.network.rpcUrl)}`,
  );
  lines.push(
    `${style.muted("program")}   ${style.dim(ctx.programId.toBase58())}`,
  );
  if (ctx.wallet) {
    lines.push(
      `${style.muted("payer")}     ${ctx.wallet.publicKey.toBase58()}`,
    );
  }
  for (const [label, value] of meta.summary ?? []) {
    lines.push(`${style.muted(label.padEnd(9))} ${value}`);
  }
  lines.push(style.muted("─".repeat(40)));
  instructions.forEach((ix, index) => {
    const signers = ix.keys.filter((k) => k.isSigner).length;
    const writable = ix.keys.filter((k) => k.isWritable).length;
    lines.push(
      `${style.bold(`#${index + 1}`)} ${style.dim(ix.programId.toBase58())} ` +
        style.muted(
          `(${ix.keys.length} accts · ${signers} signer · ${writable} writable)`,
        ),
    );
  });

  printPanel(
    ctx.output,
    `${meta.action}`,
    lines,
    ctx.network.isProduction ? "danger" : "primary",
  );
}

async function confirmOrThrow(
  ctx: CliContext,
  message: string,
): Promise<boolean> {
  if (ctx.flags.yes) {
    return true;
  }
  if (!process.stdout.isTTY) {
    throw new CliError(`Confirmation required: ${message}`, {
      code: "CONFIRMATION_REQUIRED",
      tip: "Re-run with --yes to proceed non-interactively.",
    });
  }
  return await confirm({ message, default: false });
}

async function preflightSimulate(
  ctx: CliContext,
  tx: Transaction,
): Promise<void> {
  const spinner = startSpinner(ctx.output, "Simulating transaction...");
  try {
    const result = await ctx.connection.simulateTransaction(tx);
    const units = result.value.unitsConsumed;
    if (result.value.err) {
      const logs = (result.value.logs ?? []).join("\n");
      spinner.fail("Simulation failed");
      throw new CliError(
        `Preflight simulation failed: ${JSON.stringify(result.value.err)}`,
        {
          code: "SIMULATION_FAILED",
          tip: "Inspect the program logs above. Use --no-simulate to skip this check, or --dry-run to inspect the instruction.",
          details: logs || undefined,
        },
      );
    }
    spinner.succeed(
      units !== null && units !== undefined
        ? `Simulation ok (${units.toLocaleString()} compute units)`
        : "Simulation ok",
    );
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    spinner.fail("Simulation error");
    throw new CliError(
      `Could not simulate transaction: ${error instanceof Error ? error.message : String(error)}`,
      {
        code: "SIMULATION_ERROR",
        tip: "Pass --no-simulate to skip the preflight check.",
        cause: error,
      },
    );
  }
}

/**
 * Builds, previews, guards, simulates, signs, and sends `instructions`.
 * Honors `--dry-run`, `--json`, `--yes`, `--no-simulate`, and `--compute-units`.
 */
export async function runInstructions(
  ctx: CliContext,
  instructions: TransactionInstruction[],
  meta: RunMeta,
): Promise<RunOutcome> {
  if (!ctx.wallet) {
    throw new CliError(
      `A wallet is required to ${meta.action.toLowerCase()}.`,
      {
        code: "WALLET_REQUIRED",
        tip: "Configure a wallet with `aura config init` or pass --wallet <path>.",
      },
    );
  }

  const computeUnits =
    ctx.flags.computeUnits ?? meta.computeUnits ?? DEFAULT_COMPUTE_UNIT_LIMIT;
  const budgetIxns: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
  ];
  if (meta.heapFrameBytes) {
    budgetIxns.unshift(
      ComputeBudgetProgram.requestHeapFrame({ bytes: meta.heapFrameBytes }),
    );
  }

  renderPreview(ctx, instructions, meta);

  // --- Dry run: stop before sending. ------------------------------------
  if (ctx.dryRun) {
    if (ctx.output.json) {
      emitJson(ctx.output, {
        action: meta.action,
        dryRun: true,
        network: ctx.network.label,
        instructions: instructions.map(serializeInstruction),
        ...meta.result,
      });
    } else {
      printNote(ctx.output, "Dry run — transaction was not sent.");
    }
    return { dryRun: true, aborted: false };
  }

  // --- Guard rails: confirmations. --------------------------------------
  const risk: { level: RiskLevel; reason?: string } = meta.instructionName
    ? classifyInstructionRisk(meta.instructionName)
    : { level: "normal" };

  if (ctx.network.isProduction) {
    printPanel(
      ctx.output,
      "Production network",
      [
        style.danger(
          `${symbol.warn} You are about to send a transaction on MAINNET.`,
        ),
        style.muted("This spends real funds and cannot be undone."),
      ],
      "danger",
    );
    const ok = await confirmOrThrow(ctx, "Proceed on mainnet-beta?");
    if (!ok) {
      printNote(ctx.output, "Aborted.");
      return { dryRun: false, aborted: true };
    }
  }

  if (meta.confirm || risk.level !== "normal") {
    const reason = risk.reason ? ` (${risk.reason})` : "";
    const ok = await confirmOrThrow(ctx, `Confirm "${meta.action}"${reason}?`);
    if (!ok) {
      printNote(ctx.output, "Aborted.");
      return { dryRun: false, aborted: true };
    }
  }

  // --- Assemble + sign. -------------------------------------------------
  const extraSigners = meta.extraSigners ?? [];
  const tx = new Transaction().add(...budgetIxns, ...instructions);
  tx.feePayer = ctx.wallet.publicKey;
  const latest = await ctx.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(ctx.wallet, ...extraSigners);

  // --- Preflight simulation. --------------------------------------------
  if (ctx.flags.simulate) {
    await preflightSimulate(ctx, tx);
  }

  // --- Send + confirm. --------------------------------------------------
  const spinner = startSpinner(ctx.output, `Sending: ${meta.action}...`);
  let signature: string;
  try {
    signature = await ctx.connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed",
    });
    const confirmation = await ctx.connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );
    if (confirmation.value.err) {
      spinner.fail("Transaction failed");
      throw new CliError(`Transaction ${signature} failed on-chain.`, {
        code: "TX_FAILED",
        tip: "Re-run with --dry-run to inspect the instruction, or check the explorer link.",
        details: explorerUrl(ctx, signature),
      });
    }
    spinner.succeed(`${meta.action} confirmed`);
  } catch (error) {
    if (error instanceof CliError) throw error;
    spinner.fail("Send failed");
    throw new CliError(
      `Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`,
      { code: "SEND_FAILED", cause: error },
    );
  }

  if (ctx.output.json) {
    emitJson(ctx.output, {
      action: meta.action,
      signature,
      network: ctx.network.label,
      explorer: explorerUrl(ctx, signature),
      ...meta.result,
    });
  } else {
    printSuccess(ctx.output, `${meta.action} — ${signature}`);
    printNote(ctx.output, explorerUrl(ctx, signature));
  }

  return { dryRun: false, aborted: false, signature };
}
