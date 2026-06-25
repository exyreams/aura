import { instructions } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { Command } from "commander";

import { buildCliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import {
  buildConfigureMultisigArgs,
  buildConfigureSwarmArgs,
  parseCsv,
  promptNumber,
  promptString,
  resolveTreasuryAccount,
} from "./helpers.js";

function parsePublicKeys(values: string[]): PublicKey[] {
  return values.map((value) => {
    try {
      return new PublicKey(value);
    } catch {
      throw CliError.invalidInput(
        "--guardians",
        `base58 public key (got "${value}")`,
      );
    }
  });
}

function nowSeconds(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

export function registerGovernanceCommands(program: Command): void {
  const governance = program
    .command("governance")
    .description("Manage treasury governance settings");

  governance
    .command("multisig")
    .description("Configure an emergency guardian multisig")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--required <n>", "required guardian signatures", Number)
    .option("--guardians <pk,pk,...>", "comma-separated guardian pubkeys")
    .action(async function governanceMultisig() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to configure multisig.", {
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

      const guardiansInput = await promptString(
        typeof options.guardians === "string" ? options.guardians : undefined,
        "Guardian pubkeys (comma-separated)",
      );
      const guardians = parsePublicKeys(parseCsv(guardiansInput));
      const requiredSignatures = await promptNumber(
        typeof options.required === "number" ? options.required : undefined,
        "Required signatures",
      );
      const args = buildConfigureMultisigArgs({
        requiredSignatures,
        guardians,
      });

      const instruction = await instructions.governance.configureMultisig(
        ctx.client,
        {
          accounts: {
            owner: wallet.publicKey,
            treasury: treasuryState.treasury,
          },
          args,
        },
      );

      await runInstructions(ctx, [instruction], {
        action: "Configure multisig",
        instructionName: "configure_multisig",
        summary: [["quorum", `${requiredSignatures}-of-${guardians.length}`]],
        result: { treasury: treasuryState.treasury },
      });
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
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to configure a swarm.", {
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

      const swarmId = await promptString(
        typeof options.swarmId === "string" ? options.swarmId : undefined,
        "Swarm ID",
      );
      const membersInput = await promptString(
        typeof options.members === "string" ? options.members : undefined,
        "Member agent IDs (comma-separated)",
      );
      const sharedPoolLimitUsd = await promptNumber(
        typeof options.poolLimit === "number" ? options.poolLimit : undefined,
        "Shared pool limit (USD)",
      );
      const args = buildConfigureSwarmArgs({
        swarmId,
        memberAgents: parseCsv(membersInput),
        sharedPoolLimitUsd,
      });

      const instruction = await instructions.swarm.configureSwarm(ctx.client, {
        accounts: { owner: wallet.publicKey, treasury: treasuryState.treasury },
        args,
      });

      await runInstructions(ctx, [instruction], {
        action: "Configure swarm",
        instructionName: "configure_swarm",
        summary: [
          ["swarm", swarmId],
          ["pool", `$${sharedPoolLimitUsd}`],
        ],
        result: { treasury: treasuryState.treasury },
      });
    });

  const override = governance
    .command("override")
    .description("Manage emergency override proposals");

  override
    .command("propose")
    .description("Guardian proposes a higher daily limit")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--new-daily-limit <usd>", "new daily limit in USD", Number)
    .action(async function governanceOverridePropose() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to propose an override.", {
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
      const newDailyLimitUsd = await promptNumber(
        typeof options.newDailyLimit === "number"
          ? options.newDailyLimit
          : undefined,
        "New daily limit (USD)",
      );

      const instruction = await instructions.governance.proposeOverride(
        ctx.client,
        {
          accounts: {
            guardian: wallet.publicKey,
            treasury: treasuryState.treasury,
          },
          args: {
            newDailyLimitUsd: new BN(newDailyLimitUsd),
            now: nowSeconds(),
          },
        },
      );

      await runInstructions(ctx, [instruction], {
        action: "Propose override",
        instructionName: "propose_override",
        summary: [["new daily", `$${newDailyLimitUsd}`]],
        result: { treasury: treasuryState.treasury },
      });
    });

  override
    .command("collect")
    .description("Guardian signs an active override proposal")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function governanceOverrideCollect() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError(
          "A wallet is required to collect an override signature.",
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

      const instruction =
        await instructions.governance.collectOverrideSignature(ctx.client, {
          accounts: {
            guardian: wallet.publicKey,
            treasury: treasuryState.treasury,
          },
          args: { now: nowSeconds() },
        });

      await runInstructions(ctx, [instruction], {
        action: "Collect override signature",
        instructionName: "collect_override_signature",
        result: { treasury: treasuryState.treasury },
      });
    });
}
