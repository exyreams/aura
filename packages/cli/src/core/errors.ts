/**
 * Typed CLI errors and the tip-aware error renderer.
 *
 * `CliError` carries an optional machine `code`, a human `tip` (the single most
 * useful next action), and example commands. The root error boundary renders
 * any thrown value through {@link renderError}, mapping common low-level failures
 * (RPC rate limits, missing wallets, bad inputs, failed simulations) to guidance
 * so users are never left staring at a raw stack trace.
 */

import { style, symbol } from "../ui/theme.js";

export interface CliErrorOptions {
  /** Stable machine-readable code, e.g. `WALLET_NOT_FOUND`. */
  code?: string;
  /** The single most useful next action for the user. */
  tip?: string;
  /** Example invocations that would succeed. */
  examples?: string[];
  /** Extra context (e.g. simulation logs) shown under the message. */
  details?: string;
  /** Underlying cause, preserved for debugging. */
  cause?: unknown;
}

/** An error with a user-facing tip and optional examples. */
export class CliError extends Error {
  readonly code?: string;
  readonly tip?: string;
  readonly examples?: string[];
  readonly details?: string;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "CliError";
    this.code = options.code;
    this.tip = options.tip;
    this.examples = options.examples;
    this.details = options.details;
  }

  /** Builds an error for an invalid flag/argument value, with a usage example. */
  static invalidInput(
    field: string,
    expected: string,
    example?: string,
  ): CliError {
    return new CliError(
      `Invalid value for ${style.code(field)}: expected ${expected}.`,
      {
        code: "INVALID_INPUT",
        tip: `Pass a valid ${expected} for ${field}.`,
        examples: example ? [example] : undefined,
      },
    );
  }
}

interface DerivedGuidance {
  tip?: string;
  examples?: string[];
}

/**
 * Maps a raw error message to actionable guidance. This is best-effort pattern
 * matching over common Solana/RPC/SDK failures.
 */
function deriveGuidance(message: string): DerivedGuidance {
  const lower = message.toLowerCase();

  if (
    message.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return {
      tip: "The RPC endpoint is rate limiting you. Point at a dedicated endpoint.",
      examples: [
        "aura --rpc-url https://your-rpc.example treasury show --agent-id my-agent",
      ],
    };
  }
  if (lower.includes("could not load wallet") || lower.includes("keypair")) {
    return {
      tip: "Configure a wallet, or pass one explicitly.",
      examples: [
        "aura config init",
        "aura --wallet ~/.config/solana/id.json treasury list",
      ],
    };
  }
  if (
    lower.includes("account does not exist") ||
    lower.includes("not exist") ||
    lower.includes("could not find")
  ) {
    return {
      tip: "Verify the treasury PDA or agent ID — the account may not be created yet.",
      examples: [
        "aura treasury create --agent-id my-agent --daily-limit 1000 --per-tx-limit 250",
      ],
    };
  }
  if (
    lower.includes("invalid public key") ||
    lower.includes("non-base58") ||
    lower.includes("base58")
  ) {
    return {
      tip: "A public key argument is not valid base58. Re-check the address you passed.",
    };
  }
  if (lower.includes("insufficient") && lower.includes("lamports")) {
    return {
      tip: "The fee payer is out of SOL. Fund the wallet (devnet: `solana airdrop 2`).",
    };
  }
  if (
    lower.includes("publickeyhex") ||
    lower.includes("messagemetadatadigest")
  ) {
    return {
      tip: "Re-register the live dWallet with --dwallet-account, --authorized-user, --message-metadata-digest, and --public-key-hex.",
    };
  }
  if (lower.includes("scalar confidential guardrails are not configured")) {
    return {
      tip: "Configure scalar guardrails before proposing a confidential spend.",
      examples: [
        "aura confidential guardrails scalar --agent-id my-agent --daily-limit 5000 --per-tx-limit 1000",
      ],
    };
  }
  if (lower.includes("blockhash") && lower.includes("not found")) {
    return {
      tip: "Transaction expired before confirmation. Retry the command.",
    };
  }
  return {};
}

/** Extracts a clean message string from any thrown value. */
export function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Renders an error to stderr with a leading `✗`, a tip line, and example
 * commands when available. Returns nothing; intended for the root boundary.
 */
export function renderError(error: unknown): void {
  const message = toMessage(error);
  console.error(
    `${style.danger(symbol.error)} ${style.danger("Error")}: ${message}`,
  );

  const fromCli = error instanceof CliError ? error : undefined;
  const guidance = deriveGuidance(message);

  const details = fromCli?.details;
  if (details) {
    for (const line of details.split("\n")) {
      console.error(`  ${style.muted(line)}`);
    }
  }

  const tip = fromCli?.tip ?? guidance.tip;
  if (tip) {
    console.error(`${style.warn(symbol.info)} ${style.bold("tip")}: ${tip}`);
  }

  const examples = fromCli?.examples ?? guidance.examples;
  if (examples && examples.length > 0) {
    for (const example of examples) {
      console.error(`  ${style.muted(symbol.pointer)} ${style.code(example)}`);
    }
  }

  if (fromCli?.code) {
    console.error(style.dim(`  (${fromCli.code})`));
  }
}
