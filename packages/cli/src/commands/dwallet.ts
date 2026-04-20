import { type Command } from "commander";
import { PublicKey } from "@solana/web3.js";

import { buildCliContext } from "../context.js";
import { formatChain } from "../domain.js";
import { formatUsd } from "../format.js";
import { createTable, emitJson, printBanner, printSuccess, serializeInstruction, startSpinner } from "../output.js";
import {
  buildRegisterDwalletArgs,
  promptChain,
  promptNumber,
  promptString,
  resolveTreasuryAccount,
} from "./helpers.js";

function parseOptionalPubkey(value: unknown, label: string): PublicKey | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    return new PublicKey(value.trim());
  } catch {
    throw new Error(`${label} must be a valid base58 pubkey`);
  }
}

function normalizeDigestHex(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex digest`);
  }
  return normalized;
}

function normalizePublicKeyHex(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("public-key-hex must contain valid hex bytes");
  }
  return normalized;
}

export function registerDwalletCommands(program: Command): void {
  const dwallet = program.command("dwallet").description("Manage registered Ika dWallets");

  dwallet
    .command("register")
    .description("Register a dWallet reference on a treasury")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--chain <name|number>", "target chain")
    .option("--dwallet-id <id>", "Ika dWallet ID")
    .option("--address <addr>", "native chain address")
    .option("--balance <usd>", "current balance in USD", Number)
    .option("--dwallet-account <pubkey>", "live dWallet PDA for execute/finalize flows")
    .option("--authorized-user <pubkey>", "authorized user pubkey for live dWallet signing")
    .option("--message-metadata-digest <hex>", "32-byte metadata digest for MetadataV2 signing")
    .option("--public-key-hex <hex>", "raw dWallet public key bytes in hex")
    .action(async function dwalletRegister() {
      const ctx = buildCliContext(this);
      if (!ctx.wallet) {
        throw new Error("A wallet is required to register a dWallet.");
      }

      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      const chain = await promptChain(
        typeof options["chain"] === "string" || typeof options["chain"] === "number"
          ? (options["chain"] as string | number)
          : undefined,
        "Chain",
      );
      const dwalletId = await promptString(
        typeof options["dwalletId"] === "string" ? options["dwalletId"] : undefined,
        "dWallet ID",
      );
      const address = await promptString(
        typeof options["address"] === "string" ? options["address"] : undefined,
        "Native address",
      );
      const balanceUsd = await promptNumber(
        typeof options["balance"] === "number" ? options["balance"] : undefined,
        "Current balance (USD)",
        { validate: (value) => value > 0 || (() => { throw new Error("Balance must be > 0"); })() },
      );

      const args = buildRegisterDwalletArgs({
        chain,
        dwalletId,
        address,
        balanceUsd,
        dwalletAccount: parseOptionalPubkey(options["dwalletAccount"], "dWallet account"),
        authorizedUserPubkey: parseOptionalPubkey(
          options["authorizedUser"],
          "Authorized user",
        ),
        messageMetadataDigest: normalizeDigestHex(
          options["messageMetadataDigest"],
          "Message metadata digest",
        ),
        publicKeyHex: normalizePublicKeyHex(options["publicKeyHex"]),
      });

      if (ctx.dryRun) {
        const instruction = await ctx.client.registerDwalletInstruction(
          { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
          args,
        );
        emitJson(ctx.output, {
          action: "dwallet.register",
          treasury: treasuryState.treasury,
          args,
          instruction: serializeInstruction(instruction),
        });
        return;
      }

      const spinner = startSpinner(ctx.output, "Registering dWallet...");
      const signature = await ctx.client.registerDwallet(
        ctx.wallet,
        { owner: ctx.wallet.publicKey, treasury: treasuryState.treasury },
        args,
      );
      spinner.succeed("dWallet registered");

      if (ctx.output.json) {
        emitJson(ctx.output, { treasury: treasuryState.treasury, signature });
        return;
      }

      printSuccess(ctx.output, `dWallet registered: ${signature}`);
    });

  dwallet
    .command("list")
    .description("List dWallets registered on a treasury")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .action(async function dwalletList() {
      const ctx = buildCliContext(this);
      const options = this.opts() as Record<string, unknown>;
      const treasuryState = await resolveTreasuryAccount(ctx, {
        agentId: typeof options["agentId"] === "string" ? options["agentId"] : undefined,
        treasury: typeof options["treasury"] === "string" ? options["treasury"] : undefined,
      });

      if (ctx.output.json) {
        emitJson(ctx.output, {
          treasury: treasuryState.treasury,
          dwallets: treasuryState.account.dwallets,
        });
        return;
      }

      printBanner(ctx.output, `dWallets: ${treasuryState.account.agentId}`);
      const table = createTable(["Chain", "dWallet ID", "Address", "Balance"]);
      for (const entry of treasuryState.account.dwallets) {
        table.push([
          formatChain(entry.chain),
          entry.dwalletId,
          entry.address,
          formatUsd(entry.balanceUsd),
        ]);
      }
      console.log(table.toString());
    });
}
