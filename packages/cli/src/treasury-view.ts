import { PublicKey } from "@solana/web3.js";

import {
  formatChain,
  formatProposalStatus,
  formatTransactionType,
  formatViolation,
} from "./domain.js";
import {
  formatNullable,
  formatPercentBps,
  formatPubkey,
  formatRelativeSeconds,
  formatTimestamp,
  formatUsd,
} from "./format.js";
import { createTable } from "./output.js";
import type { TreasuryAccountRecord } from "./sdk.js";

export interface TreasurySections {
  overview: string;
  policy: string;
  confidential?: string;
  dwallets?: string;
  pending?: string;
  governance?: string;
}

function renderOverview(treasury: PublicKey, account: TreasuryAccountRecord): string {
  const table = createTable(["Field", "Value"]);
  table.push(
    ["PDA", treasury.toBase58()],
    ["Agent ID", account.agentId],
    ["Owner", account.owner.toBase58()],
    ["AI Authority", account.aiAuthority.toBase58()],
    ["Status", account.executionPaused ? "Paused" : "Active"],
    ["Total tx", String(account.totalTransactions)],
    ["Created", formatTimestamp(account.createdAt)],
    ["Updated", formatTimestamp(account.updatedAt)],
  );
  return table.toString();
}

function renderPolicy(account: TreasuryAccountRecord): string {
  const policy = account.policyConfig;
  const table = createTable(["Policy", "Value"]);
  table.push(
    ["Daily limit", formatUsd(policy.dailyLimitUsd)],
    ["Per-tx limit", formatUsd(policy.perTxLimitUsd)],
    ["Daytime hourly", formatUsd(policy.daytimeHourlyLimitUsd)],
    ["Nighttime hourly", formatUsd(policy.nighttimeHourlyLimitUsd)],
    ["Velocity limit", formatUsd(policy.velocityLimitUsd)],
    ["Shared pool", formatUsd(policy.sharedPoolLimitUsd)],
    ["Max slippage", formatPercentBps(policy.maxSlippageBps)],
    ["Max quote age", formatNullable(policy.maxQuoteAgeSecs)],
    ["Max risk score", formatNullable(policy.maxCounterpartyRiskScore)],
  );
  return table.toString();
}

function renderConfidential(account: TreasuryAccountRecord): string | undefined {
  const guardrails = account.confidentialGuardrails;
  if (!guardrails) {
    return undefined;
  }

  const table = createTable(["Confidential", "Value"]);
  table.push(
    ["Daily limit ct", formatPubkey(guardrails.dailyLimitCiphertext)],
    ["Per-tx limit ct", formatPubkey(guardrails.perTxLimitCiphertext)],
    ["Spent today ct", formatPubkey(guardrails.spentTodayCiphertext)],
    ["Vector guardrail ct", formatPubkey(guardrails.guardrailVectorCiphertext)],
  );
  return table.toString();
}

function renderDwallets(account: TreasuryAccountRecord): string | undefined {
  if (account.dwallets.length === 0) {
    return undefined;
  }

  const table = createTable([
    "Chain",
    "dWallet ID",
    "Address",
    "Runtime PDA",
    "Authorized User",
    "Balance",
  ]);
  for (const dwallet of account.dwallets) {
    table.push([
      formatChain(dwallet.chain),
      dwallet.dwalletId,
      dwallet.address,
      formatPubkey(dwallet.dwalletAccount),
      formatPubkey(dwallet.authorizedUserPubkey),
      formatUsd(dwallet.balanceUsd),
    ]);
  }
  return table.toString();
}

function renderPending(account: TreasuryAccountRecord): string | undefined {
  const pending = account.pending;
  if (!pending) {
    return undefined;
  }

  const table = createTable(["Pending", "Value"]);
  table.push(
    ["Proposal ID", String(pending.proposalId)],
    ["Amount", formatUsd(pending.amountUsd)],
    ["Chain", formatChain(pending.targetChain)],
    ["Type", formatTransactionType(pending.txType)],
    ["Recipient", pending.recipientOrContract],
    ["Status", formatProposalStatus(pending.status)],
    ["Approved", pending.decision.approved ? "Yes" : "No"],
    ["Violation", formatViolation(pending.decision.violation)],
    ["Effective limit", formatUsd(pending.decision.effectiveDailyLimitUsd)],
    ["Submitted", formatTimestamp(pending.submittedAt)],
    [
      "Expires",
      `${formatTimestamp(pending.expiresAt)} (${formatRelativeSeconds(pending.expiresAt)})`,
    ],
    ["Policy output ct", formatNullable(pending.policyOutputCiphertextAccount)],
  );

  if (pending.decryptionRequest) {
    table.push(
      ["Decrypt request", pending.decryptionRequest.requestAccount],
      ["Decrypt requested", formatTimestamp(pending.decryptionRequest.requestedAt)],
      ["Decrypt verified", formatTimestamp(pending.decryptionRequest.verifiedAt)],
      ["Plaintext sha256", formatNullable(pending.decryptionRequest.plaintextSha256)],
    );
  }

  if (pending.signatureRequest) {
    table.push(
      ["Message approval", pending.signatureRequest.messageApprovalAccount],
      ["Approval ID", pending.signatureRequest.approvalId],
      ["Signature requested", formatTimestamp(pending.signatureRequest.requestedAt)],
    );
  }

  return table.toString();
}

function renderGovernance(account: TreasuryAccountRecord): string | undefined {
  if (!account.multisig && !account.swarm) {
    return undefined;
  }

  const table = createTable(["Governance", "Value"]);
  if (account.multisig) {
    table.push([
      "Multisig",
      `${account.multisig.requiredSignatures}-of-${account.multisig.guardians.length}`,
    ]);
    table.push([
      "Guardians",
      account.multisig.guardians.map((guardian) => formatPubkey(guardian)).join(", "),
    ]);
    if (account.multisig.pendingOverride) {
      table.push(
        ["Override limit", formatUsd(account.multisig.pendingOverride.newDailyLimitUsd)],
        [
          "Override sigs",
          `${account.multisig.pendingOverride.signaturesCollected.length}/${account.multisig.requiredSignatures}`,
        ],
        ["Override expiry", formatTimestamp(account.multisig.pendingOverride.expiration)],
      );
    }
  }

  if (account.swarm) {
    table.push(
      ["Swarm", account.swarm.swarmId],
      ["Members", account.swarm.memberAgents.join(", ")],
      ["Shared pool", formatUsd(account.swarm.sharedPoolLimitUsd)],
      ["Spent", formatUsd(account.swarm.totalSwarmSpentUsd)],
    );
  }

  return table.toString();
}

export function renderTreasurySections(
  treasury: PublicKey,
  account: TreasuryAccountRecord,
): TreasurySections {
  return {
    overview: renderOverview(treasury, account),
    policy: renderPolicy(account),
    confidential: renderConfidential(account),
    dwallets: renderDwallets(account),
    pending: renderPending(account),
    governance: renderGovernance(account),
  };
}
