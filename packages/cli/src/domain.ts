const CHAINS = [
  { code: 0, name: "bitcoin", label: "Bitcoin" },
  { code: 1, name: "ethereum", label: "Ethereum" },
  { code: 2, name: "solana", label: "Solana" },
  { code: 3, name: "polygon", label: "Polygon" },
  { code: 4, name: "arbitrum", label: "Arbitrum" },
  { code: 5, name: "optimism", label: "Optimism" },
] as const;

const TX_TYPES = [
  { code: 0, name: "transfer", label: "Transfer" },
  { code: 1, name: "defi_swap", label: "DeFi Swap" },
  { code: 2, name: "lending_deposit", label: "Lending Deposit" },
  { code: 3, name: "nft_purchase", label: "NFT Purchase" },
  { code: 4, name: "contract_interaction", label: "Contract Interaction" },
] as const;

const PROPOSAL_STATUSES = [
  { code: 0, label: "Proposed" },
  { code: 1, label: "Decryption Requested" },
  { code: 2, label: "Awaiting Signature" },
  { code: 3, label: "Executed" },
  { code: 4, label: "Denied" },
  { code: 5, label: "Cancelled" },
  { code: 6, label: "Expired" },
] as const;

const VIOLATIONS = [
  { code: 0, label: "none" },
  { code: 1, label: "per-tx limit" },
  { code: 2, label: "daily limit" },
  { code: 3, label: "bitcoin manual review" },
  { code: 4, label: "time window" },
  { code: 5, label: "velocity limit" },
  { code: 6, label: "protocol not allowed" },
  { code: 7, label: "slippage exceeded" },
  { code: 8, label: "quote stale" },
  { code: 9, label: "counterparty risk" },
  { code: 10, label: "shared pool limit" },
] as const;

function entryFor(
  code: number,
  entries: readonly { code: number; name?: string; label: string }[],
): { code: number; name?: string; label: string } | undefined {
  return entries.find((entry) => entry.code === code);
}

function parseCode(
  input: string | number,
  entries: readonly { code: number; name?: string; label: string }[],
  kind: string,
): number {
  const normalized = typeof input === "number" ? String(input) : input.trim().toLowerCase();
  const direct = Number(normalized);
  if (Number.isInteger(direct) && entries.some((entry) => entry.code === direct)) {
    return direct;
  }

  const match = entries.find(
    (entry) => entry.name === normalized || entry.label.toLowerCase() === normalized,
  );
  if (match) {
    return match.code;
  }

  throw new Error(`Unknown ${kind}: ${input}`);
}

function labelFor(
  code: number,
  entries: readonly { code: number; label: string }[],
  fallback: string,
): string {
  return entries.find((entry) => entry.code === code)?.label ?? fallback;
}

export function parseChain(input: string | number): number {
  return parseCode(input, CHAINS, "chain");
}

export function formatChain(code: number): string {
  return labelFor(code, CHAINS, `Unknown (${code})`);
}

export function parseTransactionType(input: string | number): number {
  return parseCode(input, TX_TYPES, "transaction type");
}

export function formatTransactionType(code: number): string {
  return labelFor(code, TX_TYPES, `Unknown (${code})`);
}

export function formatProposalStatus(code: number): string {
  return labelFor(code, PROPOSAL_STATUSES, `Unknown (${code})`);
}

export function formatViolation(code: number): string {
  return labelFor(code, VIOLATIONS, `unknown (${code})`);
}

export function chainNameForDigest(code: number): string {
  return entryFor(code, CHAINS)?.name ?? `unknown_${code}`;
}

export function transactionTypeNameForDigest(code: number): string {
  return entryFor(code, TX_TYPES)?.name ?? `unknown_${code}`;
}

export function listChainChoices(): { name: string; value: number }[] {
  return CHAINS.map((entry) => ({ name: entry.label, value: entry.code }));
}

export function listTransactionTypeChoices(): { name: string; value: number }[] {
  return TX_TYPES.map((entry) => ({ name: entry.label, value: entry.code }));
}
