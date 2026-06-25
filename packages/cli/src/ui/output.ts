/**
 * Terminal output primitives: JSON emission, banners, color-block headers,
 * panels/boxes, key-value rendering, tables, spinners, and status lines.
 *
 * Every command renders through this module (and {@link ./theme}) so the CLI
 * has a single, consistent voice. Respects `--json` and `--quiet`.
 */

import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import Table from "cli-table3";
import ora from "ora";

import { type BlockKind, block, style, symbol } from "./theme.js";

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

export const ACTIVE_DEVELOPMENT_WARNING =
  "AURA is under active development. Program instructions, account layouts, policy semantics, SDK APIs, and deployment behavior may change before a stable audited release.";

// ---------------------------------------------------------------------------
// JSON serialization
// ---------------------------------------------------------------------------

/** Recursively converts SDK/web3 values (PublicKey, BN, Buffer) into JSON-safe data. */
export function serializeForJson(value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (
    value &&
    typeof value === "object" &&
    "toBase58" in value &&
    typeof (value as { toBase58: unknown }).toBase58 === "function"
  ) {
    return (value as { toBase58(): string }).toBase58();
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

/** Prints a value as pretty JSON unless `--quiet` is set. */
export function emitJson(output: OutputOptions, value: unknown): void {
  if (!output.quiet) {
    console.log(JSON.stringify(serializeForJson(value), null, 2));
  }
}

// ---------------------------------------------------------------------------
// Headers and structure
// ---------------------------------------------------------------------------

/** Prints the top-level `AURA :: <title>` banner with an optional subtitle. */
export function printBanner(
  output: OutputOptions,
  title: string,
  subtitle?: string,
): void {
  if (output.quiet || output.json) {
    return;
  }
  const head = `${block("AURA", "primary")} ${style.bold(title)}`;
  console.log(subtitle ? `${head}  ${style.muted(subtitle)}` : head);
}

/** Prints a labeled section header chip, e.g. a magenta ` POLICY ` tag. */
export function printSection(
  output: OutputOptions,
  label: string,
  kind: BlockKind = "accent",
): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(`\n${block(label, kind)}`);
}

/** Prints a thin divider rule. */
export function divider(output: OutputOptions, width = 56): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(style.muted("─".repeat(width)));
}

// ---------------------------------------------------------------------------
// Panels / boxes
// ---------------------------------------------------------------------------

const BORDER: Record<BlockKind, (text: string) => string> = {
  primary: style.primary,
  accent: style.accent,
  success: style.success,
  warn: style.warn,
  danger: style.danger,
  info: style.info,
  muted: style.muted,
};

/**
 * Renders a bordered panel to a string. Useful for transaction previews and
 * security warnings where the content should visually stand apart.
 */
export function renderPanel(
  title: string,
  lines: string[],
  kind: BlockKind = "primary",
): string {
  const paint = BORDER[kind];
  const visibleWidth = (text: string) =>
    // Strip ANSI escapes when measuring width for alignment.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
    text.replace(/\u001b\[[0-9;]*m/g, "").length;
  const titleWidth = visibleWidth(title);
  const contentWidth = Math.max(
    titleWidth,
    ...lines.map((line) => visibleWidth(line)),
    24,
  );
  const top = paint(
    `╭─ ${style.bold(title)} ${"─".repeat(Math.max(0, contentWidth - titleWidth))}╮`,
  );
  const bottom = paint(`╰${"─".repeat(contentWidth + 3)}╯`);
  const body = lines.map((line) => {
    const pad = " ".repeat(Math.max(0, contentWidth - visibleWidth(line)));
    return `${paint("│")} ${line}${pad} ${paint("│")}`;
  });
  return [top, ...body, bottom].join("\n");
}

/** Prints a bordered panel unless `--json`/`--quiet`. */
export function printPanel(
  output: OutputOptions,
  title: string,
  lines: string[],
  kind: BlockKind = "primary",
): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(renderPanel(title, lines, kind));
}

/** Formats `[label, value]` rows into aligned `label  value` lines. */
export function keyValueLines(rows: [string, string][]): string[] {
  const labelWidth = Math.max(0, ...rows.map(([label]) => label.length));
  return rows.map(
    ([label, value]) => `${style.muted(label.padEnd(labelWidth))}  ${value}`,
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// cli-table3 has loose typings; the factory returns its Table instance.
// biome-ignore lint/suspicious/noExplicitAny: cli-table3 Table type
export function createTable(head: string[]): any {
  return new Table({
    head,
    style: { head: ["cyan"], border: ["gray"], compact: false },
    wordWrap: true,
  });
}

export function printTable(
  output: OutputOptions,
  table: { toString(): string },
): void {
  if (output.quiet || output.json) {
    return;
  }
  console.log(table.toString());
}

// ---------------------------------------------------------------------------
// Status lines
// ---------------------------------------------------------------------------

export function printSuccess(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) return;
  console.log(`${style.success(symbol.success)} ${message}`);
}

export function printInfo(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) return;
  console.log(message);
}

export function printWarn(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) return;
  console.log(`${style.warn(symbol.warn)} ${style.warn(message)}`);
}

export function printDanger(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) return;
  console.log(`${style.danger(symbol.error)} ${style.danger(message)}`);
}

export function printNote(output: OutputOptions, message: string): void {
  if (output.quiet || output.json) return;
  console.log(`${style.info(symbol.info)} ${style.muted(message)}`);
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function startSpinner(
  output: OutputOptions,
  text: string,
): SpinnerHandle {
  if (output.quiet || output.json || !process.stdout.isTTY) {
    return {
      setText() {},
      succeed() {},
      fail() {},
      stop() {},
    };
  }

  const spinner = ora({ text, color: "cyan" }).start();
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

// ---------------------------------------------------------------------------
// Instruction serialization (dry-run / JSON output)
// ---------------------------------------------------------------------------

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
