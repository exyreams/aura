import { PublicKey } from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { formatPubkey } from "../format.js";
import {
  createTable,
  emitJson,
  printBanner,
  printSuccess,
  serializeInstruction,
  startSpinner,
} from "../output.js";
import { type TreasuryAccountRecord, validateAgentId } from "../sdk.js";
import { renderTreasurySections } from "../treasury-view.js";
import {
  buildCreateTreasuryArgs,
  buildProposeTransactionArgs,
  confirmOrSkip,
  promptChain,
  promptNumber,
  promptString,
  promptTransactionType,
  resolveTreasuryAccount,
} from "./helpers.js";

const TREASURY_OWNER_OFFSET = 9;

async function renderTreasuryView(command: Command, treasury: PublicKey, account: TreasuryAccountRecord) {
  const ctx = buildCliContext(command);
  if (ctx.output.json) {
    emitJson(ctx.output, { treasury, account });
    return;
  }

  const sections = renderTreasurySections(treasury, account);
  printBanner(ctx.output, `Treasury: ${account.agentId}`);
  console.log(sections.overview);
  console.log("");
  console.log(sections.policy);

  if (sections.confidential) {
    console.log("");
    console.log(sections.confidential);
  }

  if (sections.dwallets) {
    console.log("");
    console.log(sections.dwallets);
  }

  if (sections.pending) {
    console.log("");
    console.log(sections.pending);
  }

  if (sections.governance) {
    console.log("");
    console.log(sections.governance);
  }
}

export function registerTreasuryCommands(program: Command): void {
  const treasury = program.command("treasury").description("Manage AURA treasuries");

  treasury
    .command("create")
    .description("Create a new agent treasury")
    .option("--agent-id <id>", "agent identifier")
    .option("--daily-limit <usd>", "daily spending limit in USD", Number)
    .option("--per-tx-limit <usd>", "per-transaction limit in USD", Number)
    .option("--daytime-hourly-limit <usd>", "daytime hourly limit in USD", Number)
    .option("--nighttime-hourly-limit <usd>", "nighttime hourly limit in USD", Number)
    .option("--velocity-limit <usd>", "velocity limit in USD", Number)
    .option("--max-slippage-bps <bps>", "max slippage in basis points", Number)
    .option("--max-quote-age <secs>", "max quote age in seconds", Number)
    .option("--ttl <secs>", "pending transaction TTL in seconds", Number)
    .option("--ai-authority <pubkey>", "AI authority pubkey")
    .action(async function treasuryCreate() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to create a treasury.");
      }

      const options = this.opts() as Record<string, unknown>;
      const agentId = await promptString(
        typeof options["agentId"] === "string" ? options["agentId"] : ctx.config.defaultAgentId ?? undefined,
        "Agent ID",
        { validate: validateAgentId },
      );
      const dailyLimitUsd = await promptNumber(
        typeof options["dailyLimit"] === "number" ? options["dailyLimit"] : undefined,
        "Daily limit (USD)",
        { validate: (value) => value > 0 || (() => { throw new Error("Daily limit must be > 0"); })() },
      );
      const perTxLimitUsd = await promptNumber(
        typeof options["perTxLimit"] === "number" ? options["perTxLimit"] : undefined,
        "Per-transaction limit (USD)",
        { validate: (value) => value > 0 || (() => { throw new Error("Per-tx limit must be > 0"); })() },
      );

      const args = buildCreateTreasuryArgs({
        agentId,
        aiAuthority:
          typeof options["aiAuthority"] === "string"
            ? new PublicKey(options["aiAuthority"])
            : ctx.wallet.publicKey,
        dailyLimitUsd,
        perTxLimitUsd,
        daytimeHourlyLimitUsd:
          typeof options["daytimeHourlyLimit"] === "number"
            ? options["daytimeHourlyLimit"]
            : undefined,
        nighttimeHourlyLimitUsd:
          typeof options["nighttimeHourlyLimit"] === "number"
            ? options["nighttimeHourlyLimit"]
            : undefined,
        velocityLimitUsd:
          typeof options["velocityLimit"] === "number" ? options["velocityLimit"] : undefined,
        maxSlippageBps:
          typeof options["maxSlippageBps"] === "number" ? options["maxSlippageBps"] : undefined,
        maxQuoteAgeSecs:
          typeof options["maxQuoteAge"] === "number" ? options["maxQuoteAge"] : undefined,
        pendingTransactionTtlSecs: typeof options["ttl"] === "number" ? options["ttl"] : undefined,
      });

      if (ctx.dryRun) {
        const dryRun = await ctx.client.createTreasuryInstruction({
          owner: ctx.wallet.publicKey,
          args,
        });
        emitJson(ctx.output, {
          action: "treasury.create",
          treasury: dryRun.treasury,
          args,
          instruction: serializeInstruction(dryRun.instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Creating treasury on devnet...");
      const result = await ctx.client.createTreasury(ctx.wallet, args);
      spinner.succeed("Treasury created");

      if (ctx.output.json) {
        emitJson(ctx.output, result);
        return;
      }

      printSuccess(ctx.output, `Treasury created: ${result.treasury.toBase58()}`);
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
        typeof options["interval"] === "number" && options["interval"] > 0
          ? Math.floor(options["interval"] * 1000)
          : 5000;

      const renderOnce = async () => {
        const { treasury, account } = await resolveTreasuryAccount(ctx, {
          agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
          treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
        });
        if (!ctx.output.json && options["watch"] === true) {
          console.clear();
        }
        await renderTreasuryView(this, treasury, account);
      };

      if (options["watch"] === true) {
        while (true) {
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
        throw new Error("A wallet is required to list treasuries.");
      }

      const accounts = await ctx.client.program.account.treasuryAccount.all([
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
          accounts.map((entry) => ({
            treasury: entry.publicKey,
            account: entry.account,
          })),
        );
        return;
      }

      printBanner(ctx.output, `Treasuries (${accounts.length})`);
      const table = createTable(["Agent ID", "PDA", "Status", "Total Tx"]);
      for (const entry of accounts) {
        table.push([
          entry.account.agentId,
          formatPubkey(entry.publicKey),
          entry.account.executionPaused ? "Paused" : "Active",
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
      if (!ctx.wallet) {
        throw new Error("A wallet is required to propose a transaction.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      const amountUsd = await promptNumber(
        typeof options["amount"] === "number" ? options["amount"] : undefined,
        "Amount (USD)",
        { validate: (value) => value > 0 || (() => { throw new Error("Amount must be > 0"); })() },
      );
      const chain = await promptChain(
        typeof options["chain"] === "string" || typeof options["chain"] === "number"
          ? (options["chain"] as string | number)
          : undefined,
        "Chain",
      );
      const recipient = await promptString(
        typeof options["recipient"] === "string" ? options["recipient"] : undefined,
        "Recipient",
      );
      const txType = await promptTransactionType(
        typeof options["txType"] === "string" || typeof options["txType"] === "number"
          ? (options["txType"] as string | number)
          : undefined,
        "Transaction type",
      );

      const args = buildProposeTransactionArgs({
        amountUsd,
        chain,
        txType,
        recipient,
        protocolId: typeof options["protocolId"] === "number" ? options["protocolId"] : undefined,
        expectedOutputUsd:
          typeof options["expectedOutput"] === "number" ? options["expectedOutput"] : undefined,
        actualOutputUsd:
          typeof options["actualOutput"] === "number" ? options["actualOutput"] : undefined,
        quoteAgeSecs: typeof options["quoteAge"] === "number" ? options["quoteAge"] : undefined,
        counterpartyRiskScore:
          typeof options["counterpartyRisk"] === "number"
            ? options["counterpartyRisk"]
            : undefined,
      });

      if (ctx.dryRun) {
        const instruction = await ctx.client.proposeTransactionInstruction(
          { aiAuthority: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          args,
        );
        emitJson(ctx.output, {
          action: "treasury.propose",
          treasury: treasuryState.treasury,
          args,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Submitting proposal...");
      const signature = await ctx.client.proposeTransaction(
        ctx.wallet,
        { aiAuthority: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        args,
      );
      spinner.succeed("Proposal submitted");

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          signature,
        });
        return;
      }

      printSuccess(ctx.output, `Proposal submitted: ${signature}`);
    });

  treasury
    .command("cancel")
    .description("Cancel the current pending transaction")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--yes", "skip confirmation")
    .action(async function treasuryCancel() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to cancel a pending transaction.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      if (!treasuryState.account.pending) {
        throw new Error("This treasury has no pending transaction to cancel.");
      }

      const confirmed = await confirmOrSkip(options["yes"] === true, "Cancel the current pending transaction?");
      if (!confirmed) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (ctx.dryRun) {
        const instruction = await ctx.client.cancelPendingInstruction(
          { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          now,
        );
        emitJson(ctx.output, {
          action: "treasury.cancel",
          treasury: treasuryState.treasury,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Cancelling pending transaction...");
      const signature = await ctx.client.cancelPending(
        ctx.wallet,
        { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        now,
      );
      spinner.succeed("Pending transaction cancelled");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Pending transaction cancelled: ${signature}`);
    });

  treasury
    .command("pause")
    .description("Pause or unpause treasury execution")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--unpause", "unpause instead of pause")
    .option("--yes", "skip confirmation")
    .action(async function treasuryPause() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to pause or unpause a treasury.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      const paused = options["unpause"] !== true;
      const confirmed = await confirmOrSkip(
        options["yes"] === true,
        paused ? "Pause this treasury?" : "Unpause this treasury?",
      );
      if (!confirmed) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (ctx.dryRun) {
        const instruction = await ctx.client.pauseExecutionInstruction(
          { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          paused,
          now,
        );
        emitJson(ctx.output, {
          action: paused ? "treasury.pause" : "treasury.unpause",
          treasury: treasuryState.treasury,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(
        ctx.output,
        paused ? "Pausing treasury..." : "Unpausing treasury...",
      );
      const signature = await ctx.client.pauseExecution(
        ctx.wallet,
        { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        paused,
        now,
      );
      spinner.succeed(paused ? "Treasury paused" : "Treasury unpaused");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, paused, signature });
        return;
      }

      printSuccess(
        ctx.output,
        `${paused ? "Treasury paused" : "Treasury unpaused"}: ${signature}`,
      );
    });
}
