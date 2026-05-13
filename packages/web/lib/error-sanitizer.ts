/**
 * Data-driven error sanitizer for on-chain / backend errors.
 *
 * Add a new entry to ERROR_RULES to handle a new error pattern — no
 * function changes needed. Rules are tested in order; the first match wins.
 *
 * The fallback strips noise from the raw message (UUIDs, Program log prefixes,
 * simulation wrappers, log tails) and returns whatever is left, so unknown
 * errors still surface something useful rather than a generic string.
 */

interface ErrorRule {
  /** Regex tested against the raw error message (case-insensitive). */
  pattern: RegExp;
  /** Human-readable message returned when the pattern matches. */
  message: string;
}

// ---------------------------------------------------------------------------
// Rule table — ordered from most-specific to least-specific.
// Simulation-failure compound checks come before the generic "simulation failed"
// catch-all so the inner pattern wins when both are present in the same string.
// ---------------------------------------------------------------------------
const ERROR_RULES: ErrorRule[] = [
  // ── Wallet / signing ──────────────────────────────────────────────────────
  {
    pattern: /user rejected|rejected the request|user denied/i,
    message: "Transaction cancelled by wallet.",
  },
  {
    pattern: /wallet not connected|no wallet|connect.*wallet/i,
    message: "No wallet connected. Connect a wallet and try again.",
  },
  {
    pattern: /wallet.*locked|please unlock/i,
    message: "Your wallet is locked. Unlock it and try again.",
  },

  // ── Program-specific errors (check before generic simulation catch-all) ───
  {
    pattern: /UnauthorizedAi|unauthorized ai signer|0x1770/i,
    message:
      "Unauthorized AI signer — the selected agent is not the AI authority on this treasury. Select the correct agent.",
  },
  {
    pattern: /0x1783|PendingTransactionExpired|pending transaction expired/i,
    message:
      "This proposal has expired (TTL elapsed). Cancel it and create a new one.",
  },
  {
    pattern: /memory allocation failed|out of memory|SBF program panicked/i,
    message:
      "A proposal is already active on this treasury. Cancel the existing proposal before submitting a new one.",
  },
  {
    pattern: /execution paused/i,
    message:
      "Execution is paused on this treasury. Unpause it before submitting proposals.",
  },
  {
    pattern: /no pending transaction|no pending proposal/i,
    message: "No pending proposal found on this treasury.",
  },
  {
    pattern: /proposal.*already.*exists/i,
    message:
      "A proposal is already active on this treasury. Cancel it before creating a new one.",
  },
  {
    pattern: /proposal.*denied/i,
    message: "Proposal was denied by the policy engine.",
  },
  {
    pattern: /treasury.*not.*found/i,
    message:
      "Treasury not found. It may have been closed or the address is incorrect.",
  },
  {
    pattern: /ttl.*elapsed|proposal.*expired/i,
    message: "This proposal has expired. Create a new one.",
  },

  // ── Funds / fees ──────────────────────────────────────────────────────────
  {
    pattern: /insufficient funds for rent/i,
    message: "Not enough SOL to cover rent. Top up your wallet and try again.",
  },
  {
    pattern: /insufficient lamports|insufficient funds/i,
    message: "Insufficient funds to complete this transaction.",
  },
  {
    // 0x1 = Solana's generic "insufficient funds" program error code
    pattern: /\b0x1\b/,
    message:
      "Not enough SOL in your wallet. Fund it with devnet SOL and try again.",
  },

  // ── Transaction lifecycle ─────────────────────────────────────────────────
  {
    pattern: /blockhash not found|blockhash.*expired/i,
    message:
      "Transaction expired — the network was too slow. Please try again.",
  },
  {
    pattern: /was not confirmed|transaction not confirmed/i,
    message: "Transaction timed out waiting for confirmation. Try again.",
  },
  {
    pattern: /transaction too large/i,
    message: "Transaction is too large to submit. Contact support.",
  },
  {
    pattern: /already.*processed|duplicate.*transaction/i,
    message:
      "This transaction was already processed. Refresh and check the proposal status.",
  },
  {
    pattern: /transaction.*failed|failed.*transaction/i,
    message:
      "Transaction failed on-chain. Check your wallet balance and try again.",
  },
  {
    // Generic simulation failure — must come after all specific program errors
    pattern: /simulation failed/i,
    message:
      "Transaction simulation failed. Check your wallet balance and try again.",
  },

  // ── RPC / network ─────────────────────────────────────────────────────────
  {
    pattern:
      /fetch.*fail|network.*error|econnrefused|enotfound|failed to fetch/i,
    message:
      "Could not reach the backend. Check your network connection and backend URL in Settings.",
  },
  {
    pattern: /timeout|timed out waiting for/i,
    message:
      "Request timed out. The network may be congested — please try again.",
  },
  {
    pattern: /429|rate.?limit/i,
    message: "Too many requests. Wait a moment and try again.",
  },
  {
    pattern: /rpc.*error|node.*error/i,
    message:
      "RPC node error. Try switching to a different endpoint in Settings.",
  },

  // ── Accounts / program ────────────────────────────────────────────────────
  {
    pattern: /account.*not found|could not find account|invalid.*account/i,
    message:
      "Account not found on-chain. The treasury or dWallet may not be initialized.",
  },
  {
    pattern: /account.*already.*exist|already in use/i,
    message:
      "Account already exists. Refresh the page and check for an active proposal.",
  },
  {
    pattern: /invalid.*program|program.*not.*found/i,
    message: "Program not found. Verify the Program ID in Settings.",
  },
  {
    pattern: /owner.*mismatch|invalid.*owner/i,
    message:
      "Account owner mismatch. Ensure you are using the correct program ID.",
  },

  // ── Agent ─────────────────────────────────────────────────────────────────
  {
    pattern: /create and select an agent/i,
    message: "No agent selected. Create and select an agent first.",
  },
  {
    pattern: /agent.*not found|invalid.*agent/i,
    message: "Agent not found. Select a valid agent in the agent panel.",
  },
  {
    pattern: /agent.*not.*authorized|agent.*permission/i,
    message: "This agent is not authorized to act on this treasury.",
  },

  // ── Ika / dWallet ─────────────────────────────────────────────────────────
  {
    pattern: /message approval not ready|approval.*not.*ready/i,
    message:
      "Waiting for Ika to sign — the signature isn't ready yet. Check the IKA status indicator.",
  },
  {
    pattern: /dwallet not configured|no dwallet/i,
    message:
      "No dWallet registered for this chain. Register one in treasury settings first.",
  },
  {
    pattern: /dwallet.*mismatch/i,
    message:
      "dWallet mismatch. The registered dWallet doesn't match the proposal.",
  },
  {
    pattern: /ika.*unavailable|ika.*error/i,
    message: "Ika network is unavailable. Try again in a few moments.",
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    pattern: /unauthorized|not authorized|forbidden/i,
    message: "You are not authorized to perform this action.",
  },
];

// ---------------------------------------------------------------------------
// Fallback: strip noise and return the cleaned raw message.
// This surfaces something useful for errors not yet in the rule table.
// ---------------------------------------------------------------------------
function cleanRawMessage(msg: string): string {
  return msg
    .replace(/\s*\([0-9a-f-]{36}\)\s*$/i, "") // trailing UUID
    .replace(/^Program log:\s*/i, "") // Program log prefix
    .replace(/Simulation failed\.\s*Message:\s*/i, "") // simulation wrapper
    .replace(/Transaction simulation failed:\s*/i, "")
    .replace(/Error processing Instruction \d+:\s*/i, "")
    .replace(/\.\s*Logs:[\s\S]*$/i, "") // log tail
    .trim();
}

/**
 * Converts a raw error message into a user-facing string.
 *
 * @param error - An `Error` instance, a string, or anything else.
 * @param fallback - Returned only when the input is empty/null/undefined.
 *                   Defaults to "An unexpected error occurred."
 */
export function sanitizeError(
  error: unknown,
  fallback = "An unexpected error occurred.",
): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  if (!msg) return fallback;

  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(msg)) return rule.message;
  }

  return cleanRawMessage(msg) || fallback;
}
