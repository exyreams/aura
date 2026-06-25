/**
 * RPC endpoint classification.
 *
 * Used to drive guard rails: a write against a production (mainnet) endpoint
 * gets an explicit confirmation, and the resolved network is surfaced in every
 * transaction preview so users always know where a transaction is going.
 */

export type ClusterKind =
  | "mainnet"
  | "devnet"
  | "testnet"
  | "localnet"
  | "custom";

export interface NetworkInfo {
  kind: ClusterKind;
  /** Human label, e.g. "mainnet-beta" or "devnet". */
  label: string;
  rpcUrl: string;
  /** True for mainnet — the only network treated as production/high-risk. */
  isProduction: boolean;
}

/** Classifies an RPC URL into a known Solana cluster. */
export function classifyNetwork(rpcUrl: string): NetworkInfo {
  const lower = rpcUrl.toLowerCase();
  let kind: ClusterKind = "custom";
  let label = "custom";

  if (lower.includes("mainnet")) {
    kind = "mainnet";
    label = "mainnet-beta";
  } else if (lower.includes("devnet")) {
    kind = "devnet";
    label = "devnet";
  } else if (lower.includes("testnet")) {
    kind = "testnet";
    label = "testnet";
  } else if (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("0.0.0.0")
  ) {
    kind = "localnet";
    label = "localnet";
  }

  return {
    kind,
    label,
    rpcUrl,
    isProduction: kind === "mainnet",
  };
}
