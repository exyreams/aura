import boxen from "boxen";
import BN from "bn.js";
import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

export interface SpinnerHandle {
  setText(text: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  stop(): void;
}

export function serializeForJson(value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (BN.isBN(value)) {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeForJson(entry),
      ]),
    );
  }
  return value;
}

export function emitJson(output: OutputOptions, value: unknown): void {
  if (!output.quiet) {
    console.log(JSON.stringify(serializeForJson(value), null, 2));
  }
}

export function printBanner(output: OutputOptions, title: string): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(
    boxen(chalk.bold(title), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: "cyan",
      borderStyle: "round",
      margin: { bottom: 1 },
    }),
  );
}

export function createTable(head: string[]): any {
  return new Table({
    head,
    style: {
      head: ["cyan"],
      border: ["gray"],
      compact: false,
    },
    wordWrap: true,
  });
}

export function printTable(output: OutputOptions, table: { toString(): string }): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(table.toString());
}

export function printSuccess(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(chalk.green(`✓ ${message}`));
}

export function printInfo(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(message);
}

export function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
    return `${message}\nSuggestion: set AURA_RPC_URL or AURA_DEVNET_RPC_URL to a dedicated RPC endpoint.`;
  }
  if (message.includes("Could not load wallet keypair")) {
    return `${message}\nSuggestion: run 'aura config init' or pass --wallet /path/to/id.json.`;
  }
  if (message.includes("Account does not exist") || message.includes("not exist")) {
    return `${message}\nSuggestion: verify the treasury PDA or agent ID, or create the treasury first.`;
  }
  if (message.includes("publicKeyHex") || message.includes("messageMetadataDigest")) {
    return `${message}\nSuggestion: re-register the live dWallet with --dwallet-account, --authorized-user, --message-metadata-digest, and --public-key-hex.`;
  }
  if (message.includes("Scalar confidential guardrails are not configured")) {
    return `${message}\nSuggestion: run 'aura confidential guardrails scalar ...' before proposing a confidential spend.`;
  }
  return message;
}

export function printError(error: unknown): void {
  console.error(chalk.red(`Error: ${formatError(error)}`));
}

export function startSpinner(output: OutputOptions, text: string): SpinnerHandle {
  if (output.quiet || output.json) {
    return {
      setText(_text: string) {},
      succeed(_message?: string) {},
      fail(_message?: string) {},
      stop() {},
    };
  }

  const spinner = ora({
    text,
    color: "cyan",
  }).start();

  return {
    setText(nextText: string) {
      spinner.text = nextText;
    },
    succeed(message?: string) {
      spinner.succeed(message);
    },
    fail(message?: string) {
      spinner.fail(message);
    },
    stop() {
      spinner.stop();
    },
  };
}

export function serializeInstruction(instruction: TransactionInstruction) {
  return {
    programId: instruction.programId.toBase58(),
    accounts: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  };
}
