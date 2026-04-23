import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Bot,
  CheckCircle2,
  Lock,
  Shield,
  Siren,
  Waves,
} from "lucide-react";

export type TreasuryStatus = "Active" | "Paused" | "Pending";

export const appLinks = [
  { label: "Dashboard", href: "/app" },
  { label: "Treasuries", href: "/app/treasuries" },
  { label: "Agent", href: "/app/agent" },
  {
    label: "Confidential",
    href: "/app/treasuries/8HUQd7KQ9Mdtj2vV5nP4kK3xstWqgS11mLMv3At9wK/confidential",
  },
  {
    label: "Governance",
    href: "/app/treasuries/8HUQd7KQ9Mdtj2vV5nP4kK3xstWqgS11mLMv3At9wK/governance",
  },
  { label: "Settings", href: "/app/settings" },
];

export const supportedChains = [
  { name: "Ethereum", status: "dWallet active" },
  { name: "Bitcoin", status: "Manual review threshold enabled" },
  { name: "Solana", status: "Primary settlement path" },
  { name: "Polygon", status: "Bridge policy configured" },
  { name: "Arbitrum", status: "Low-latency swap lane" },
  { name: "Optimism", status: "Rollup routing enabled" },
];

export const featureHighlights: Array<{
  title: string;
  detail: string;
  icon: LucideIcon;
}> = [
  {
    title: "Confidential guardrails",
    detail:
      "Encrypt daily and per-transaction limits while preserving policy-aware execution.",
    icon: Lock,
  },
  {
    title: "Multi-chain execution",
    detail:
      "Register chain-specific dWallets and evaluate transactions against network context.",
    icon: Waves,
  },
  {
    title: "11-rule policy engine",
    detail:
      "Cover velocity, slippage, quote age, TTL, counterparty risk, and more in one surface.",
    icon: Shield,
  },
  {
    title: "Emergency override",
    detail:
      "Use multisig guardians and swarm coordination when automation needs a hard stop.",
    icon: Siren,
  },
];

export const summaryCards = [
  { label: "Total Treasuries", value: 4, helper: "3 active, 1 paused" },
  {
    label: "Total Transactions",
    value: 126,
    helper: "17 proposals in the last 24h",
  },
  { label: "Total Volume", value: 284500, helper: "Across all chains" },
  { label: "Active Agents", value: 3, helper: "2 live models, 1 standby" },
];

export const treasuryStats = {
  totalVolume: 284500,
  walletBalance: 14.72,
  rpcLatency: "81ms",
  dailySpent: 68240,
  dailyLimit: 95000,
};

export const spendingSeries = [
  { day: "Mon", spend: 12000, limit: 95000 },
  { day: "Tue", spend: 24400, limit: 95000 },
  { day: "Wed", spend: 31800, limit: 95000 },
  { day: "Thu", spend: 26850, limit: 95000 },
  { day: "Fri", spend: 42700, limit: 95000 },
  { day: "Sat", spend: 38900, limit: 95000 },
  { day: "Sun", spend: 68240, limit: 95000 },
];

export const agentSpendSeries = [
  { time: "08:00", spend: 4200, approved: 2 },
  { time: "10:00", spend: 9600, approved: 4 },
  { time: "12:00", spend: 17400, approved: 6 },
  { time: "14:00", spend: 21800, approved: 7 },
  { time: "16:00", spend: 29400, approved: 9 },
  { time: "18:00", spend: 35200, approved: 11 },
];

export const treasuries = [
  {
    agentId: "alpha-sol",
    pda: "8HUQd7KQ9Mdtj2vV5nP4kK3xstWqgS11mLMv3At9wK",
    status: "Active" as const,
    dailyLimit: 95000,
    totalTx: 44,
    createdDate: "Apr 13, 2026",
    perTxLimit: 22000,
    reputation: 92,
    chain: "Solana",
  },
  {
    agentId: "btc-hedge",
    pda: "6Lpr4SjMhVf4mM5WBm4QhEWrc5iDSaKXo2AqH7HMeQtP",
    status: "Paused" as const,
    dailyLimit: 60000,
    totalTx: 18,
    createdDate: "Apr 02, 2026",
    perTxLimit: 12000,
    reputation: 84,
    chain: "Bitcoin",
  },
  {
    agentId: "arb-flow",
    pda: "Gx7jQj9b2PB1ifp8JvMZqhmUL5YUh3AXJXYNocHtAjQ2",
    status: "Active" as const,
    dailyLimit: 78000,
    totalTx: 39,
    createdDate: "Mar 27, 2026",
    perTxLimit: 18000,
    reputation: 89,
    chain: "Arbitrum",
  },
  {
    agentId: "poly-yield",
    pda: "7vbCP4B9d8n5Qf4Pce5M2Ypn6SLk3PoSmG4N3p1D7jJx",
    status: "Pending" as const,
    dailyLimit: 51500,
    totalTx: 25,
    createdDate: "Mar 19, 2026",
    perTxLimit: 9000,
    reputation: 77,
    chain: "Polygon",
  },
];

export const recentActivity = [
  {
    id: "ACT-104",
    title: "Swap USDC to SOL",
    treasury: "alpha-sol",
    amount: 6400,
    chain: "Solana",
    status: "Approved",
    timestamp: "2026-04-23 18:24 UTC",
  },
  {
    id: "ACT-103",
    title: "Bridge WBTC to Ethereum",
    treasury: "btc-hedge",
    amount: 12000,
    chain: "Bitcoin",
    status: "Denied",
    timestamp: "2026-04-23 17:52 UTC",
  },
  {
    id: "ACT-102",
    title: "Lend USDC to Kamino",
    treasury: "alpha-sol",
    amount: 8400,
    chain: "Solana",
    status: "Pending",
    timestamp: "2026-04-23 17:11 UTC",
  },
  {
    id: "ACT-101",
    title: "Swap ETH to ARB",
    treasury: "arb-flow",
    amount: 9100,
    chain: "Arbitrum",
    status: "Approved",
    timestamp: "2026-04-23 16:44 UTC",
  },
];

export const activityFeed = [
  {
    timestamp: "18:24 UTC",
    decision: "Mean reversion triggered on SOL",
    amount: 6400,
    chain: "Solana",
    result: "Approved",
  },
  {
    timestamp: "17:52 UTC",
    decision: "Bridge hedge to Ethereum",
    amount: 12000,
    chain: "Bitcoin",
    result: "Denied",
  },
  {
    timestamp: "17:11 UTC",
    decision: "Deploy idle capital into lending",
    amount: 8400,
    chain: "Solana",
    result: "Pending",
  },
  {
    timestamp: "16:44 UTC",
    decision: "Rotate ARB profits to stable",
    amount: 9100,
    chain: "Arbitrum",
    result: "Approved",
  },
];

export const policyRules = [
  ["Daily limit", "$95,000"],
  ["Per-transaction limit", "$22,000"],
  ["Hourly limit", "$30,000"],
  ["Velocity limit", "6 tx / 60 min"],
  ["Slippage", "1.2%"],
  ["Quote age", "15 sec"],
  ["TTL", "180 sec"],
  ["Counterparty risk score", "<= 0.42"],
  ["Manual review threshold", "$35,000 on Bitcoin"],
  ["Protocol allowlist", "Jupiter, Kamino, Drift"],
];

export const dwallets = [
  {
    chain: "Solana",
    address: "DWa11et....sOL44",
    balance: "$142,200",
    status: "Live signing",
  },
  {
    chain: "Arbitrum",
    address: "DWa11et....ARB19",
    balance: "$58,430",
    status: "Live signing",
  },
  {
    chain: "Bitcoin",
    address: "bc1qa...3u9v",
    balance: "$24,880",
    status: "Manual review",
  },
];

export const auditTrail = [
  [
    "PolicyApproved",
    "Swap proposal within daily and per-tx limits",
    "18:24 UTC",
  ],
  ["GuardrailVerified", "Scalar ciphertext account verified", "17:58 UTC"],
  ["OverrideSigned", "Guardian 2 signed active override", "17:30 UTC"],
  ["ProposalDenied", "Risk score exceeded threshold 0.42", "17:12 UTC"],
  ["dWalletRegistered", "Arbitrum signing wallet registered", "16:45 UTC"],
];

export const confidentialHistory = [
  ["CONF-01", "Scalar limit refresh", "Verified", "2026-04-23 17:58 UTC"],
  ["CONF-00", "Vector guardrail init", "Confirmed", "2026-04-21 14:06 UTC"],
];

export const stepLabels = [
  "Basic info",
  "Policy limits",
  "Advanced",
  "Review",
  "Confirmation",
];

export const settingsGroups = {
  network: [
    ["Environment", "Devnet"],
    ["Custom RPC", "https://api.devnet.solana.com"],
    ["Program ID", "AURA1111111111111111111111111111111111111"],
  ],
  display: [
    ["Currency", "USD"],
    ["Date format", "MMM DD, YYYY HH:mm"],
    ["Theme mode", "Dark"],
  ],
};

export const governanceCards = [
  {
    title: "Emergency Multisig",
    value: "2 / 3",
    helper: "Guardians required for override execution",
  },
  {
    title: "Active Override",
    value: "$120,000",
    helper: "Expires in 02:41:13",
  },
  {
    title: "Swarm Pool Limit",
    value: "$300,000",
    helper: "Shared across 4 agents",
  },
];

export const overviewPanels = [
  {
    title: "Runtime",
    value: "Healthy",
    helper: "RPC stable, policy engine synced",
    icon: CheckCircle2,
  },
  {
    title: "Agent",
    value: "Model live",
    helper: "Mistral Small 4B via proxy",
    icon: Bot,
  },
  {
    title: "Alerts",
    value: "2 open",
    helper: "1 pending review, 1 override countdown",
    icon: BellRing,
  },
];
