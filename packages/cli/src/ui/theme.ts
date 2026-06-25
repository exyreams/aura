/**
 * Terminal theme: semantic colors, symbols, and color "blocks" (chips).
 *
 * The whole CLI renders through this module so the look stays consistent and
 * color can be disabled in one place. Color is suppressed automatically when:
 *   - `NO_COLOR` is set (https://no-color.org/),
 *   - the `--no-color` flag is passed (wired in via {@link setColorEnabled}),
 *   - stdout is not a TTY (piped/redirected),
 * unless `FORCE_COLOR` is set.
 */

import chalk, { Chalk, type ChalkInstance } from "chalk";

/** A chalk instance with color forced off, used when color is disabled. */
const plain = new Chalk({ level: 0 });

let colorEnabled = computeDefaultColorSupport();

function computeDefaultColorSupport(): boolean {
  if (
    process.env.FORCE_COLOR !== undefined &&
    process.env.FORCE_COLOR !== "0"
  ) {
    return true;
  }
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

/** Enables or disables ANSI color globally for the process. */
export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

/** Whether color output is currently enabled. */
export function isColorEnabled(): boolean {
  return colorEnabled;
}

/** Returns the active chalk instance (color or plain) based on the global toggle. */
function c(): ChalkInstance {
  return colorEnabled ? chalk : plain;
}

/**
 * Semantic color styles. Always call through these rather than reaching for
 * chalk directly so the `--no-color` / `NO_COLOR` toggle is always honored.
 */
export const style = {
  primary: (text: string) => c().cyan(text),
  accent: (text: string) => c().magenta(text),
  success: (text: string) => c().green(text),
  warn: (text: string) => c().yellow(text),
  danger: (text: string) => c().red(text),
  info: (text: string) => c().blueBright(text),
  muted: (text: string) => c().gray(text),
  bold: (text: string) => c().bold(text),
  dim: (text: string) => c().dim(text),
  underline: (text: string) => c().underline(text),
  code: (text: string) => c().yellowBright(text),
} as const;

/** Unicode glyphs used across the UI. */
export const symbol = {
  success: "✓",
  error: "✗",
  warn: "⚠",
  info: "ℹ",
  arrow: "→",
  bullet: "•",
  dot: "·",
  pointer: "❯",
  ellipsis: "…",
} as const;

export type BlockKind =
  | "primary"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  | "info"
  | "muted";

/**
 * Renders a filled "color block" / chip — an inverse-color label with one space
 * of padding on each side, e.g. a teal ` AURA ` tag. Used for banners, section
 * headers, and severity tags. Falls back to `[LABEL]` when color is disabled.
 */
export function block(label: string, kind: BlockKind = "primary"): string {
  const text = ` ${label} `;
  if (!colorEnabled) {
    return `[${label}]`;
  }
  switch (kind) {
    case "primary":
      return chalk.bgCyan.black(text);
    case "accent":
      return chalk.bgMagenta.white(text);
    case "success":
      return chalk.bgGreen.black(text);
    case "warn":
      return chalk.bgYellow.black(text);
    case "danger":
      return chalk.bgRed.white(text);
    case "info":
      return chalk.bgBlue.white(text);
    case "muted":
      return chalk.bgGray.white(text);
  }
}

/** Maps a free-form label to a block kind for instruction maturity tags. */
export function maturityKind(maturity: string): BlockKind {
  switch (maturity) {
    case "wallet":
      return "primary";
    case "backend":
      return "info";
    case "read_only":
    case "read-only":
      return "muted";
    case "external_cpi":
    case "external-cpi":
      return "accent";
    default:
      return "muted";
  }
}
