import {
  accounts,
  instructions,
  type TreasuryAccountRecord,
  validateAgentId,
} from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { Command } from "commander";

import { buildCliContext, type CliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import { getActivePendingProposal } from "../lib/protocol.js";
import { renderTreasurySections } from "../lib/treasury-view.js";
import { formatPubkey } from "../ui/format.js";
import { createTable, emitJson, printBanner, printInfo } from "../ui/output.js";
import { style } from "../ui/theme.js";
import {
  buildCreateTreasuryArgs,
  buildProposeTransactionArgs,
  promptChain,
  promptNumber,
  promptString,
  promptTransactionType,
  resolveTreasuryAccount,
} from "./helpers.js";

// Anchor discriminator (8) + schema_version u8 (1) + bump u8 (1) = 10
const TREASURY_OWNER_OFFSET = 10;

function renderTreasuryView(
  ctx: CliContext,
  treasury: PublicKey,
  account: TreasuryAccountRecord,
): void {
  if (ctx.output.json) {
    emitJson(ctx.output, { treasury, account });
    return;
  }

  const sections = renderTreasurySections(treasury, account);
  printBanner(ctx.output, `Treasury: ${account.agentId}`, treasury.toBase58());
  console.log(sections.overview);
  console.log("");
  console.log(sections.policy);
  for (const section of [
    sections.confidential,
    sections.dwallets,
    sections.pending,
    sections.governance,
  ]) {
    if (section) {
      console.log("");
      console.log(section);
    }
  }
}

export function registerTreasuryCommands(program: Command): void {
  const treasury = program
    .command("treasury")
    .description("Create and manage AURA treasuries");

  treasury
    .command("create")
    .description("Create a new agent treasury")
    .option("--agent-id <id>", "agent identifier")
    .option("--daily-limit <usd>", "daily spending limit in USD", Number)
    .option("--per-tx-limit <usd>", "per-transaction limit in USD", Number)
    .option(
      "--daytime-hourly-limit <usd>",
      "daytime hourly limit in USD",
      Number,
    )
    .option(
      "--nighttime-hourly-limit <usd>",
      "nighttime hourly limit in USD",
      Number,
    )
    .option("--velocity-limit <usd>", "velocity limit in USD", Number)
    .option("--max-slippage-bps <bps>", "max slippage in basis points", Number)
    .option("--max-quote-age <secs>", "max quote age in seconds", Number)
    .option("--ttl <secs>", "pending transaction TTL in seconds", Number)
    .option("--ai-authority <pubkey>", "AI authority pubkey")
    .action(async function treasuryCreate() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to create a treasury.", {
          code: "WALLET_REQUIRED",
          tip: "Run `aura config init` or pass --wallet <path>.",
        });
      }

      const options = this.opts() as Record<string, unknown>;
      const agentId = await promptString(
        typeof options.agentId === "string"
          ? options.agentId
          : (ctx.config.defaultAgentId ?? undefined),
        "Agent ID",
        { validate: validateAgentId },
      );
      const dailyLimitUsd = await promptNumber(
        typeof options.dailyLimit === "number" ? options.dailyLimit : undefined,
        "Daily limit (USD)",
        {
          validate: (value) => {
            if (value <= 0) throw new Error("Daily limit must be > 0");
          },
        },
      );
      const perTxLimitUsd = await promptNumber(
        typeof options.perTxLimit === "number" ? options.perTxLimit : undefined,
        "Per-transaction limit (USD)",
        {
          validate: (value) => {
            if (value <= 0) throw new Error("Per-tx limit must be > 0");
          },
        },
      );

      const aiAuthority =
        typeof options.aiAuthority === "string"
          ? new PublicKey(options.aiAuthority)
          : wallet.publicKey;

      const args = buildCreateTreasuryArgs({
        agentId,
        aiAuthority,
        dailyLimitUsd,
        perTxLimitUsd,
        daytimeHourlyLimitUsd:
          typeof options.daytimeHourlyLimit === "number"
            ? options.daytimeHourlyLimit
            : undefined,
        nighttimeHourlyLimitUsd:
          typeof options.nighttimeHourlyLimit === "number"
            ? options.nighttimeHourlyLimit
            : undefined,
        velocityLimitUsd:
          typeof options.velocityLimit === "number"
            ? options.velocityLimit
            : undefined,
        maxSlippageBps:
          typeof options.maxSlippageBps === "number"
            ? options.maxSlippageBps
            : undefined,
        maxQuoteAgeSecs:
          typeof options.maxQuoteAge === "number"
            ? options.maxQuoteAge
            : undefined,
        pendingTransactionTtlSecs:
          typeof options.ttl === "number" ? options.ttl : undefined,
      });

      const prepared = accounts.createTreasuryInput({
        owner: wallet.publicKey,
        args,
        programId: ctx.programId,
      });
      const instruction = await instructions.treasury.createTreasury(
        ctx.client,
        prepared.input,
      );

      const outcome = await runInstructions(ctx, [instruction], {
        action: "Create treasury",
        instructionName: "create_treasury",
        summary: [
          ["agent", agentId],
          ["treasury", prepared.treasury.toBase58()],
          ["daily", `$${dailyLimitUsd}`],
          ["per-tx", `$${perTxLimitUsd}`],
        ],
        result: { treasury: prepared.treasury },
      });

      if (outcome.signature && !ctx.output.json) {
        printInfo(
          ctx.output,
          `${style.muted("treasury")}  ${prepared.treasury.toBase58()}`,
        );
      }
    });

  treasury
    .command("show")
    .description("Show treasury state")
    .option("--agent-id <id>", "look up by agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--watch", "refresh every 5 seconds")
    .option("--interval <secs>", "watch refresh interval in seconds", Number)
    .action(async function treasuryShow() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const intervalMs =
        typeof options.interval === "number" && options.interval > 0
          ? Math.floor(options.interval * 1000)
          : 5000;

      const renderOnce = async () => {
        const { treasury, account } = await resolveTreasuryAccount(ctx, {
          agentId:
            typeof options.agentId === "string" ? options.agentId : undefined,
          treasury:
            typeof options.treasury === "string" ? options.treasury : undefined,
        });
        if (!ctx.output.json && options.watch === true) {
          console.clear();
        }
        renderTreasuryView(ctx, treasury, account);
      };

      if (options.watch === true) {
        for (;;) {
          await renderOnce();
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }

      await renderOnce();
    });

  treasury
    .command("list")
    .description("List treasuries owned by the configured wallet")
    .action(async function treasuryList() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new CliError("A wallet is required to list treasuries.", {
          code: "WALLET_REQUIRED",
          tip: "Run `aura config init` or pass --wallet <path>.",
        });
      }

      const owned = await ctx.client.program.account.treasuryAccount.all([
        {
          memcmp: {
            offset: TREASURY_OWNER_OFFSET,
            bytes: ctx.wallet.publicKey.toBase58(),
          },
        },
      ]);

      if (ctx.output.json) {
        emitJson(
          ctx.output,
          owned.map((entry) => ({
            treasury: entry.publicKey,
            account: entry.account,
          })),
        );
        return;
      }

      printBanner(ctx.output, "Treasuries", `${owned.length} owned`);
      const table = createTable(["Agent ID", "PDA", "Status", "Total Tx"]);
      for (const entry of owned) {
        table.push([
          entry.account.agentId,
          formatPubkey(entry.publicKey),
          entry.account.executionPaused
            ? style.warn("Paused")
            : style.success("Active"),
          String(entry.account.totalTransactions),
        ]);
      }
      console.log(table.toString());
    });

  treasury
    .command("propose")
    .description("Propose a public transaction")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--amount <usd>", "amount in USD", Number)
    .option("--chain <name|number>", "target chain")
    .option("--recipient <address>", "recipient address or contract")
    .option("--tx-type <type>", "transaction type")
    .option("--protocol-id <id>", "protocol ID", Number)
    .option("--expected-output <usd>", "expected output in USD", Number)
    .option("--actual-output <usd>", "actual output in USD", Number)
    .option("--quote-age <secs>", "quote age in seconds", Number)
    .option("--counterparty-risk <score>", "counterparty risk score", Number)
    .action(async function treasuryPropose() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to propose a transaction.", {
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

      const amountUsd = await promptNumber(
        typeof options.amount === "number" ? options.amount : undefined,
        "Amount (USD)",
        {
          validate: (value) => {
            if (value <= 0) throw new Error("Amount must be > 0");
          },
        },
      );
      const chain = await promptChain(
        typeof options.chain === "string" || typeof options.chain === "number"
          ? (options.chain as string | number)
          : undefined,
        "Chain",
      );
      const recipient = await promptString(
        typeof options.recipient === "string" ? options.recipient : undefined,
        "Recipient",
      );
      const txType = await promptTransactionType(
        typeof options.txType === "string" || typeof options.txType === "number"
          ? (options.txType as string | number)
          : undefined,
        "Transaction type",
      );

      const args = buildProposeTransactionArgs({
        amountUsd,
        chain,
        txType,
        recipient,
        protocolId:
          typeof options.protocolId === "number"
            ? options.protocolId
            : undefined,
        expectedOutputUsd:
          typeof options.expectedOutput === "number"
            ? options.expectedOutput
            : undefined,
        actualOutputUsd:
          typeof options.actualOutput === "number"
            ? options.actualOutput
            : undefined,
        quoteAgeSecs:
          typeof options.quoteAge === "number" ? options.quoteAge : undefined,
        counterpartyRiskScore:
          typeof options.counterpartyRisk === "number"
            ? options.counterpartyRisk
            : undefined,
      });

      const instruction = await instructions.execution.proposeTransaction(
        ctx.client,
        {
          accounts: {
            aiAuthority: wallet.publicKey,
            treasury: treasuryState.treasury,
            sessionKeyAccount: null,
            swarmPool: null,
            addressList: null,
            complianceOracle: null,
            parentTreasury: null,
            budgetEnvelope: null,
            exposureGroup: null,
            dwalletState: null,
            chainProfile: null,
            trustIdentity: null,
            policyCanary: null,
          },
          args,
        },
      );

      await runInstructions(ctx, [instruction], {
        action: "Propose transaction",
        instructionName: "propose_transaction",
        summary: [
          ["amount", `$${amountUsd}`],
          ["recipient", recipient],
        ],
        result: { treasury: treasuryState.treasury },
      });
    });

  treasury
    .command("cancel")
    .description("Cancel the current pending transaction")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function treasuryCancel() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError(
          "A wallet is required to cancel a pending transaction.",
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

      if (!getActivePendingProposal(treasuryState.account)) {
        throw new CliError(
          "This treasury has no pending transaction to cancel.",
          {
            code: "NO_PENDING",
          },
        );
      }

      const instruction = await instructions.execution.cancelPending(
        ctx.client,
        {
          accounts: {
            owner: wallet.publicKey,
            treasury: treasuryState.treasury,
            dwalletState: null,
          },
          args: { now: new BN(nowSeconds()) },
        },
      );

      await runInstructions(ctx, [instruction], {
        action: "Cancel pending transaction",
        instructionName: "cancel_pending",
        confirm: true,
        result: { treasury: treasuryState.treasury },
      });
    });

  treasury
    .command("pause")
    .description("Pause or unpause treasury execution")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--unpause", "unpause instead of pause")
    .action(async function treasuryPause() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError(
          "A wallet is required to pause or unpause a treasury.",
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
      const paused = options.unpause !== true;

      const instruction = await instructions.execution.pauseExecution(
        ctx.client,
        {
          accounts: {
            owner: wallet.publicKey,
            treasury: treasuryState.treasury,
          },
          args: { paused, now: new BN(nowSeconds()) },
        },
      );

      await runInstructions(ctx, [instruction], {
        action: paused ? "Pause treasury" : "Unpause treasury",
        instructionName: "pause_execution",
        confirm: true,
        result: { treasury: treasuryState.treasury, paused },
      });
    });
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
