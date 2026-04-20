import { PublicKey } from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { emitJson, printSuccess, serializeInstruction, startSpinner } from "../output.js";
import {
  buildConfigureMultisigArgs,
  buildConfigureSwarmArgs,
  parseCsv,
  promptNumber,
  promptString,
  resolveTreasuryAccount,
} from "./helpers.js";

function parsePublicKeys(values: string[]): PublicKey[] {
  return values.map((value) => new PublicKey(value));
}

export function registerGovernanceCommands(program: Command): void {
  const governance = program.command("governance").description("Manage treasury governance settings");

  governance
    .command("multisig")
    .description("Configure an emergency guardian multisig")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--required <n>", "required guardian signatures", Number)
    .option("--guardians <pk,pk,...>", "comma-separated guardian pubkeys")
    .action(async function governanceMultisig() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to configure multisig.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      const guardiansInput = await promptString(
        typeof options["guardians"] === "string" ? options["guardians"] : undefined,
        "Guardian pubkeys (comma-separated)",
      );
      const guardians = parsePublicKeys(parseCsv(guardiansInput));
      const requiredSignatures = await promptNumber(
        typeof options["required"] === "number" ? options["required"] : undefined,
        "Required signatures",
      );
      const args = buildConfigureMultisigArgs({ requiredSignatures, guardians });

      if (ctx.dryRun) {
        const instruction = await ctx.client.configureMultisigInstruction(
          { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          args,
        );
        emitJson(ctx.output, {
          action: "governance.multisig",
          treasury: treasuryState.treasury,
          args,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Configuring multisig...");
      const signature = await ctx.client.configureMultisig(
        ctx.wallet,
        { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        args,
      );
      spinner.succeed("Multisig configured");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Multisig configured: ${signature}`);
    });

  governance
    .command("swarm")
    .description("Configure an agent swarm with shared pool limits")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--swarm-id <id>", "swarm identifier")
    .option("--members <id,id,...>", "comma-separated member agent IDs")
    .option("--pool-limit <usd>", "shared pool limit in USD", Number)
    .action(async function governanceSwarm() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to configure a swarm.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      const swarmId = await promptString(
        typeof options["swarmId"] === "string" ? options["swarmId"] : undefined,
        "Swarm ID",
      );
      const membersInput = await promptString(
        typeof options["members"] === "string" ? options["members"] : undefined,
        "Member agent IDs (comma-separated)",
      );
      const sharedPoolLimitUsd = await promptNumber(
        typeof options["poolLimit"] === "number" ? options["poolLimit"] : undefined,
        "Shared pool limit (USD)",
      );
      const args = buildConfigureSwarmArgs({
        swarmId,
        memberAgents: parseCsv(membersInput),
        sharedPoolLimitUsd,
      });

      if (ctx.dryRun) {
        const instruction = await ctx.client.configureSwarmInstruction(
          { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          args,
        );
        emitJson(ctx.output, {
          action: "governance.swarm",
          treasury: treasuryState.treasury,
          args,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Configuring swarm...");
      const signature = await ctx.client.configureSwarm(
        ctx.wallet,
        { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        args,
      );
      spinner.succeed("Swarm configured");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Swarm configured: ${signature}`);
    });

  const override = governance.command("override").description("Manage emergency override proposals");

  override
    .command("propose")
    .description("Guardian proposes a higher daily limit")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--new-daily-limit <usd>", "new daily limit in USD", Number)
    .action(async function governanceOverridePropose() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to propose an override.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const newDailyLimitUsd = await promptNumber(
        typeof options["newDailyLimit"] === "number" ? options["newDailyLimit"] : undefined,
        "New daily limit (USD)",
      );
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.proposeOverrideInstruction(
          { guardian: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          newDailyLimitUsd,
          now,
        );
        emitJson(ctx.output, {
          action: "governance.override.propose",
          treasury: treasuryState.treasury,
          newDailyLimitUsd,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Submitting override proposal...");
      const signature = await ctx.client.proposeOverride(
        ctx.wallet,
        { guardian: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        newDailyLimitUsd,
        now,
      );
      spinner.succeed("Override proposed");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Override proposed: ${signature}`);
    });

  override
    .command("collect")
    .description("Guardian signs an active override proposal")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function governanceOverrideCollect() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to collect an override signature.");
      }
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });
      const now = Math.floor(Date.now() / 1000);

      if (ctx.dryRun) {
        const instruction = await ctx.client.collectOverrideSignatureInstruction(
          { guardian: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          now,
        );
        emitJson(ctx.output, {
          action: "governance.override.collect",
          treasury: treasuryState.treasury,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Collecting override signature...");
      const signature = await ctx.client.collectOverrideSignature(
        ctx.wallet,
        { guardian: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        now,
      );
      spinner.succeed("Override signature collected");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `Override signature collected: ${signature}`);
    });
}
