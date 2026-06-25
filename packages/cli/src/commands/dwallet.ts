import { instructions } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import type { Command } from "commander";

import { buildCliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import { formatChain } from "../lib/domain.js";
import { formatUsd } from "../ui/format.js";
import { createTable, emitJson, printBanner } from "../ui/output.js";
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
    throw CliError.invalidInput(label, "base58 public key");
  }
}

function normalizeDigestHex(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw CliError.invalidInput(label, "32-byte hex digest (64 hex chars)");
  }
  return normalized;
}

function normalizePublicKeyHex(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw CliError.invalidInput("--public-key-hex", "even-length hex bytes");
  }
  return normalized;
}

export function registerDwalletCommands(program: Command): void {
  const dwallet = program
    .command("dwallet")
    .description("Manage registered Ika dWallets");

  dwallet
    .command("register")
    .description("Register a dWallet reference on a treasury")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--chain <name|number>", "target chain")
    .option("--dwallet-id <id>", "Ika dWallet ID")
    .option("--address <addr>", "native chain address")
    .option("--balance <usd>", "current balance in USD", Number)
    .option(
      "--dwallet-account <pubkey>",
      "live dWallet PDA for execute/finalize flows",
    )
    .option(
      "--authorized-user <pubkey>",
      "authorized user pubkey for live dWallet signing",
    )
    .option(
      "--message-metadata-digest <hex>",
      "32-byte metadata digest for metadata signing",
    )
    .option("--public-key-hex <hex>", "raw dWallet public key bytes in hex")
    .action(async function dwalletRegister() {
      const ctx = buildCliContext(this);
      const wallet = ctx.wallet;
      if (!wallet) {
        throw new CliError("A wallet is required to register a dWallet.", {
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

      const chain = await promptChain(
        typeof options.chain === "string" || typeof options.chain === "number"
          ? (options.chain as string | number)
          : undefined,
        "Chain",
      );
      const dwalletId = await promptString(
        typeof options.dwalletId === "string" ? options.dwalletId : undefined,
        "dWallet ID",
      );
      const address = await promptString(
        typeof options.address === "string" ? options.address : undefined,
        "Native address",
      );
      const balanceUsd = await promptNumber(
        typeof options.balance === "number" ? options.balance : undefined,
        "Current balance (USD)",
        {
          validate: (value) => {
            if (value <= 0) throw new Error("Balance must be > 0");
          },
        },
      );

      const args = buildRegisterDwalletArgs({
        chain,
        dwalletId,
        address,
        balanceUsd,
        dwalletAccount: parseOptionalPubkey(
          options.dwalletAccount,
          "--dwallet-account",
        ),
        authorizedUserPubkey: parseOptionalPubkey(
          options.authorizedUser,
          "--authorized-user",
        ),
        messageMetadataDigest: normalizeDigestHex(
          options.messageMetadataDigest,
          "--message-metadata-digest",
        ),
        publicKeyHex: normalizePublicKeyHex(options.publicKeyHex),
      });

      const instruction = await instructions.dwallet.registerDwallet(
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
        action: "Register dWallet",
        instructionName: "register_dwallet",
        summary: [
          ["chain", formatChain(chain)],
          ["dwallet", dwalletId],
          ["address", address],
        ],
        result: { treasury: treasuryState.treasury },
      });
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
        agentId:
          typeof options.agentId === "string" ? options.agentId : undefined,
        treasury:
          typeof options.treasury === "string" ? options.treasury : undefined,
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
