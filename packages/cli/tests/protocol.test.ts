import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";

import {
  deriveApprovedExecutionAccounts,
  deriveMetadataV2MessageApprovalAddress,
  parseCiphertextVerified,
  parseDecryptionReady,
  parseMessageApprovalState,
  resolveScalarGuardrails,
  resolveVectorGuardrail,
} from "../src/protocol.js";
import type { TreasuryAccountRecord } from "../src/sdk.js";

const OWNER = new PublicKey("11111111111111111111111111111111");
const AI_AUTHORITY = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const TREASURY = new PublicKey("SysvarRent111111111111111111111111111111111");
const DWALLET_ACCOUNT = new PublicKey("Vote111111111111111111111111111111111111111");

function sampleAccount(): TreasuryAccountRecord {
  return {
    bump: 1,
    owner: OWNER,
    aiAuthority: AI_AUTHORITY,
    agentId: "agent-1",
    createdAt: 1n,
    updatedAt: 2n,
    nextProposalId: 43n,
    totalTransactions: 0n,
    executionPaused: false,
    pendingTransactionTtlSecs: 900n,
    policyConfig: {
      dailyLimitUsd: 1000n,
      perTxLimitUsd: 500n,
      daytimeHourlyLimitUsd: 200n,
      nighttimeHourlyLimitUsd: 100n,
      velocityLimitUsd: 300n,
      allowedProtocolBitmap: 31n,
      maxSlippageBps: 100n,
      maxQuoteAgeSecs: 300n,
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: 5000n,
      sharedPoolLimitUsd: null,
      reputationPolicy: {
        highScoreThreshold: 80n,
        mediumScoreThreshold: 50n,
        highMultiplierBps: 15000n,
        lowMultiplierBps: 7000n,
      },
    },
    policyState: {
      spentTodayUsd: 0n,
      lastResetTimestamp: 0n,
      hourlySpentUsd: 0n,
      hourlyBucketStartedAt: 0n,
      recentAmounts: [],
    },
    confidentialGuardrails: {
      dailyLimitCiphertext: new PublicKey("Stake11111111111111111111111111111111111111"),
      perTxLimitCiphertext: new PublicKey("Config1111111111111111111111111111111111111"),
      spentTodayCiphertext: new PublicKey("AddressLookupTab1e1111111111111111111111111"),
      guardrailVectorCiphertext: new PublicKey("SysvarC1ock11111111111111111111111111111111"),
    },
    reputation: {
      totalTransactions: 0n,
      successfulTransactions: 0n,
      failedTransactions: 0n,
      totalVolumeUsd: 0n,
    },
    fees: {
      treasuryCreationFeeUsd: 100n,
      transactionFeeBps: 10n,
      fheSubsidyBps: 5000n,
    },
    dwallets: [
      {
        chain: 2,
        dwalletId: "dw-1",
        address: "9xQeWvG816bUx9EPjHmaT23yvVMi1XwACR8Y4xC8kq5",
        balanceUsd: 0n,
        dwalletAccount: DWALLET_ACCOUNT,
        authorizedUserPubkey: OWNER,
        messageMetadataDigest: "22".repeat(32),
        publicKeyHex: "11".repeat(32),
        curve: 2,
        signatureScheme: 5,
      },
    ],
    pending: {
      proposalId: 42n,
      proposalDigest: "a".repeat(64),
      policyGraphName: "confidential_spend_guardrails",
      policyOutputDigest: "b".repeat(64),
      policyOutputCiphertextAccount: TREASURY.toBase58(),
      policyOutputFheType: 12,
      targetChain: 2,
      txType: 0,
      amountUsd: 250n,
      recipientOrContract: "Recipient1111111111111111111111111111111111",
      protocolId: null,
      submittedAt: 10n,
      expiresAt: 900n,
      lastUpdatedAt: 10n,
      executionAttempts: 0,
      status: 0,
      decryptionRequest: null,
      signatureRequest: null,
      decision: {
        approved: true,
        violation: 0,
        effectiveDailyLimitUsd: 1000n,
        nextState: {
          spentTodayUsd: 250n,
          lastResetTimestamp: 10n,
          hourlySpentUsd: 250n,
          hourlyBucketStartedAt: 10n,
          recentAmounts: [250n],
        },
        trace: [],
      },
    },
    multisig: null,
    swarm: null,
  } as TreasuryAccountRecord;
}

test("deriveMetadataV2MessageApprovalAddress matches the expected devnet PDA", () => {
  const account = sampleAccount();
  const [messageApproval] = deriveMetadataV2MessageApprovalAddress(
    account.pending!,
    account.dwallets[0],
  );

  assert.equal(
    messageApproval.toBase58(),
    "DsqxVi1EZeMQGUgmLHYZTuHRkk3bUGNhFuUKJsrzYmDT",
  );
});

test("deriveApprovedExecutionAccounts derives the message approval and dWallet CPI accounts", () => {
  const account = sampleAccount();
  const resolved = deriveApprovedExecutionAccounts(account);

  assert.equal(resolved.messageApproval.toBase58(), "DsqxVi1EZeMQGUgmLHYZTuHRkk3bUGNhFuUKJsrzYmDT");
  assert.equal(resolved.dwalletAccount.toBase58(), DWALLET_ACCOUNT.toBase58());
  assert.equal(resolved.pending.proposalId.toString(), "42");
});

test("guardrail resolvers return configured scalar and vector ciphertexts", () => {
  const account = sampleAccount();
  const scalar = resolveScalarGuardrails(account);
  const vector = resolveVectorGuardrail(account);

  assert.equal(
    scalar.dailyLimitCiphertext.toBase58(),
    account.confidentialGuardrails!.dailyLimitCiphertext!.toBase58(),
  );
  assert.equal(vector.toBase58(), account.confidentialGuardrails!.guardrailVectorCiphertext!.toBase58());
});

test("live account parsers recognize ciphertext, decryption, and message approval states", () => {
  const ciphertext = { data: Buffer.alloc(100) };
  ciphertext.data[99] = 1;

  const decryption = { data: Buffer.alloc(107) };
  decryption.data.writeUInt32LE(32, 99);
  decryption.data.writeUInt32LE(32, 103);

  const messageApprovalV2 = Buffer.alloc(304);
  messageApprovalV2[0] = 14;
  messageApprovalV2[172] = 1;

  const messageApprovalV1 = Buffer.alloc(142);
  messageApprovalV1[0] = 14;
  messageApprovalV1[139] = 0;

  assert.equal(parseCiphertextVerified(ciphertext as never), true);
  assert.equal(parseDecryptionReady(decryption as never), true);
  assert.equal(parseMessageApprovalState(messageApprovalV2), "signed");
  assert.equal(parseMessageApprovalState(messageApprovalV1), "pending");
  assert.equal(parseMessageApprovalState(Buffer.alloc(2)), "missing");
});
