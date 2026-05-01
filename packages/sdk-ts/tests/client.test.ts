import assert from "node:assert/strict";
import test from "node:test";

import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  AuraClient,
  type ApplyPolicyPresetArgs,
  type ApprovePendingExecutionArgs,
  type AttestPolicyArgs,
  type CheckInvariantsArgs,
  type ConfigureApprovalLadderArgs,
  type ConfigureBudgetEnvelopeArgs,
  type ConfigureLivenessGuardrailsArgs,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type GrantOperatorRoleArgs,
  type InitExposureGroupArgs,
  type InitExternalLivenessArgs,
  type ProposeBatchArgs,
  type ProposeConfidentialTransactionArgs,
  type ProposeTransactionArgs,
  type RefreshExternalLivenessArgs,
  type RegisterDwalletArgs,
  type SetScopedPauseArgs,
  type SimulatePolicyArgs,
  type WritePolicyReceiptArgs,
} from "../src/index.js";

// helpers

function makeConnection(): Connection {
  return new Connection("http://127.0.0.1:8899", "confirmed");
}

function makeClient(programId?: PublicKey): AuraClient {
  return new AuraClient({ connection: makeConnection(), programId });
}

function defaultCreateTreasuryArgs(owner: PublicKey): CreateTreasuryArgs {
  return {
    agentId: "agent-1",
    aiAuthority: owner,
    createdAt: new BN(1),
    pendingTransactionTtlSecs: new BN(900),
    policyConfig: {
      dailyLimitUsd: new BN(10_000),
      perTxLimitUsd: new BN(1_000),
      daytimeHourlyLimitUsd: new BN(2_500),
      nighttimeHourlyLimitUsd: new BN(500),
      velocityLimitUsd: new BN(5_000),
      allowedProtocolBitmap: new BN(31),
      maxSlippageBps: new BN(100),
      maxQuoteAgeSecs: new BN(300),
      maxCounterpartyRiskScore: 70,
      bitcoinManualReviewThresholdUsd: new BN(5_000),
      sharedPoolLimitUsd: null,
      weeklyLimitUsd: null,
      monthlyLimitUsd: null,
      recipientLimits: [],
      cooldownConfig: null,
      anomalyConfig: null,
      reputationPolicy: {
        highScoreThreshold: new BN(80),
        mediumScoreThreshold: new BN(50),
        highMultiplierBps: new BN(15_000),
        lowMultiplierBps: new BN(7_000),
      },
      budgetEnvelopes: [],
      approvalLadder: null,
      scopedPauseEntries: [],
      livenessConfig: {
        requireEncryptFreshness: false,
        requireDwalletFreshness: false,
        requireBalanceOracleFreshness: false,
        requireComplianceOracleFreshness: false,
        maxStalenessSecs: new BN(300),
      },
    },
    protocolFees: {
      treasuryCreationFeeUsd: new BN(100),
      transactionFeeBps: new BN(10),
      fheSubsidyBps: new BN(5_000),
    },
  };
}

function defaultProposeTransactionArgs(): ProposeTransactionArgs {
  return {
    amountUsd: new BN(250),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(42),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "recipient",
    sanctionsProof: [],
  };
}

function defaultConfidentialArgs(): ProposeConfidentialTransactionArgs {
  return {
    amountUsd: new BN(500),
    targetChain: 1,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(100),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "0xdeadbeef",
    sanctionsProof: [],
  };
}

function randomAccounts<K extends string>(keys: K[]): Record<K, PublicKey> {
  return Object.fromEntries(keys.map((k) => [k, Keypair.generate().publicKey])) as Record<
    K,
    PublicKey
  >;
}

// AuraClient construction

test("AuraClient: defaults to AURA_PROGRAM_ID", () => {
  const client = makeClient();
  assert.equal(client.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
});

test("AuraClient: accepts custom programId", () => {
  const custom = Keypair.generate().publicKey;
  const client = makeClient(custom);
  assert.equal(client.programId.toBase58(), custom.toBase58());
});

test("AuraClient: exposes connection", () => {
  const conn = makeConnection();
  const client = new AuraClient({ connection: conn });
  assert.strictEqual(client.connection, conn);
});

test("AuraClient: coder is a BorshInstructionCoder", () => {
  const client = makeClient();
  assert.ok(typeof client.coder.decode === "function");
  assert.ok(typeof client.coder.encode === "function");
});

// PDA helpers on client

test("client.deriveTreasuryAddress matches standalone helper", () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const [fromClient, bumpClient] = client.deriveTreasuryAddress(owner, "agent-1");
  const [fromHelper, bumpHelper] = client.deriveTreasuryAddress(owner, "agent-1");
  assert.equal(fromClient.toBase58(), fromHelper.toBase58());
  assert.equal(bumpClient, bumpHelper);
});

test("client.deriveDwalletCpiAuthority is deterministic", () => {
  const client = makeClient();
  const [a] = client.deriveDwalletCpiAuthority();
  const [b] = client.deriveDwalletCpiAuthority();
  assert.equal(a.toBase58(), b.toBase58());
});

test("client.deriveEncryptCpiAuthority is deterministic", () => {
  const client = makeClient();
  const [a] = client.deriveEncryptCpiAuthority();
  const [b] = client.deriveEncryptCpiAuthority();
  assert.equal(a.toBase58(), b.toBase58());
});

test("client.deriveEncryptEventAuthority is deterministic", () => {
  const client = makeClient();
  const encryptProgram = Keypair.generate().publicKey;
  const [a] = client.deriveEncryptEventAuthority(encryptProgram);
  const [b] = client.deriveEncryptEventAuthority(encryptProgram);
  assert.equal(a.toBase58(), b.toBase58());
});

// createTreasuryInstruction

test("createTreasuryInstruction builds and decodes", async () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const { treasury, instruction } = await client.createTreasuryInstruction({
    owner,
    args: defaultCreateTreasuryArgs(owner),
  });

  assert.equal(instruction.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
  assert.equal(
    treasury.toBase58(),
    client.deriveTreasuryAddress(owner, "agent-1")[0].toBase58(),
  );

  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "create_treasury");
});

test("createTreasuryInstruction accepts explicit treasury override", async () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const explicitTreasury = Keypair.generate().publicKey;
  const { treasury } = await client.createTreasuryInstruction({
    owner,
    treasury: explicitTreasury,
    args: defaultCreateTreasuryArgs(owner),
  });
  assert.equal(treasury.toBase58(), explicitTreasury.toBase58());
});

test("createTreasuryInstruction includes systemProgram account", async () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const { instruction } = await client.createTreasuryInstruction({
    owner,
    args: defaultCreateTreasuryArgs(owner),
  });
  const keys = instruction.keys.map((k) => k.pubkey.toBase58());
  assert.ok(keys.includes(SystemProgram.programId.toBase58()));
});

test("createTreasuryInstruction: custom programId flows into instruction", async () => {
  const programId = Keypair.generate().publicKey;
  const client = makeClient(programId);
  const owner = Keypair.generate().publicKey;
  const { instruction } = await client.createTreasuryInstruction({
    owner,
    args: defaultCreateTreasuryArgs(owner),
  });
  assert.equal(instruction.programId.toBase58(), programId.toBase58());
});

test("createTreasuryInstruction: different agentIds produce different treasury PDAs", async () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const args1 = { ...defaultCreateTreasuryArgs(owner), agentId: "agent-A" };
  const args2 = { ...defaultCreateTreasuryArgs(owner), agentId: "agent-B" };
  const { treasury: t1 } = await client.createTreasuryInstruction({ owner, args: args1 });
  const { treasury: t2 } = await client.createTreasuryInstruction({ owner, args: args2 });
  assert.notEqual(t1.toBase58(), t2.toBase58());
});

// proposeTransactionInstruction

test("proposeTransactionInstruction builds and decodes", async () => {
  const client = makeClient();
  const instruction = await client.proposeTransactionInstruction(
    {
      aiAuthority: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    defaultProposeTransactionArgs(),
  );

  assert.equal(instruction.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "propose_transaction");
});

test("proposeTransactionInstruction: all chain values encode correctly", async () => {
  const client = makeClient();
  const accounts = {
    aiAuthority: Keypair.generate().publicKey,
    treasury: Keypair.generate().publicKey,
  };
  for (const targetChain of [0, 1, 2, 3, 4, 5]) {
    const instruction = await client.proposeTransactionInstruction(accounts, {
      ...defaultProposeTransactionArgs(),
      targetChain,
    });
    const decoded = client.coder.decode(instruction.data);
    assert.ok(decoded, `chain ${targetChain} should decode`);
  }
});

test("proposeTransactionInstruction: optional fields accept null", async () => {
  const client = makeClient();
  const instruction = await client.proposeTransactionInstruction(
    {
      aiAuthority: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    {
      ...defaultProposeTransactionArgs(),
      protocolId: null,
      expectedOutputUsd: null,
      actualOutputUsd: null,
      quoteAgeSecs: null,
      counterpartyRiskScore: null,
    },
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
});

// registerDwalletInstruction

test("registerDwalletInstruction builds and decodes", async () => {
  const client = makeClient();
  const args: RegisterDwalletArgs = {
    chain: 2,
    dwalletId: "dwallet-abc",
    address: "0xdeadbeef",
    balanceUsd: new BN(10_000),
    dwalletAccount: null,
    authorizedUserPubkey: null,
    messageMetadataDigest: null,
    publicKeyHex: null,
    timestamp: new BN(1_700_000_000),
  };
  const instruction = await client.registerDwalletInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    args,
  );
  assert.equal(instruction.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "register_dwallet");
});

// configureMultisigInstruction

test("configureMultisigInstruction builds and decodes", async () => {
  const client = makeClient();
  const guardians = [
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
  ];
  const args: ConfigureMultisigArgs = {
    requiredSignatures: 2,
    guardians,
    timestamp: new BN(1_700_000_000),
  };
  const instruction = await client.configureMultisigInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    args,
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "configure_multisig");
});

// configureSwarmInstruction

test("configureSwarmInstruction builds and decodes", async () => {
  const client = makeClient();
  const args: ConfigureSwarmArgs = {
    swarmId: "swarm-alpha",
    memberAgents: ["agent-1", "agent-2"],
    sharedPoolLimitUsd: new BN(50_000),
    timestamp: new BN(1_700_000_000),
  };
  const instruction = await client.configureSwarmInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    args,
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "configure_swarm");
});

// proposeOverrideInstruction

test("proposeOverrideInstruction builds and decodes", async () => {
  const client = makeClient();
  const instruction = await client.proposeOverrideInstruction(
    {
      guardian: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    new BN(20_000),
    new BN(1_700_000_000),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "propose_override");
});

test("proposeOverrideInstruction: accepts BNish number for limit and timestamp", async () => {
  const client = makeClient();
  const instruction = await client.proposeOverrideInstruction(
    {
      guardian: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    20_000,
    1_700_000_000,
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
});

// collectOverrideSignatureInstruction

test("collectOverrideSignatureInstruction builds and decodes", async () => {
  const client = makeClient();
  const instruction = await client.collectOverrideSignatureInstruction(
    {
      guardian: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    new BN(1_700_000_000),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "collect_override_signature");
});

// pauseExecutionInstruction

test("pauseExecutionInstruction builds and decodes (pause=true)", async () => {
  const client = makeClient();
  const instruction = await client.pauseExecutionInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    true,
    new BN(42),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "pause_execution");
});

test("pauseExecutionInstruction builds and decodes (pause=false)", async () => {
  const client = makeClient();
  const instruction = await client.pauseExecutionInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    false,
    42,
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
});

// cancelPendingInstruction

test("cancelPendingInstruction builds and decodes", async () => {
  const client = makeClient();
  const instruction = await client.cancelPendingInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    new BN(99),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "cancel_pending");
});

// executePendingInstruction

test("executePendingInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "operator",
      "treasury",
      "messageApproval",
      "dwallet",
      "callerProgram",
      "cpiAuthority",
      "dwalletProgram",
      "dwalletCoordinator",
      "systemProgram",
    ] as const),
  };
  const instruction = await client.executePendingInstruction(accounts, new BN(1));
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "execute_pending");
});

// finalizeExecutionInstruction

test("finalizeExecutionInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts(["operator", "treasury", "messageApproval"] as const),
  };
  const instruction = await client.finalizeExecutionInstruction(accounts, new BN(1));
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "finalize_execution");
});

// requestPolicyDecryptionInstruction

test("requestPolicyDecryptionInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "operator",
      "treasury",
      "requestAccount",
      "ciphertext",
      "encryptProgram",
      "config",
      "deposit",
      "callerProgram",
      "cpiAuthority",
      "networkEncryptionKey",
      "eventAuthority",
      "systemProgram",
    ] as const),
  };
  const instruction = await client.requestPolicyDecryptionInstruction(accounts, new BN(1));
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "request_policy_decryption");
});

// confirmPolicyDecryptionInstruction

test("confirmPolicyDecryptionInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts(["operator", "treasury", "requestAccount"] as const),
  };
  const instruction = await client.confirmPolicyDecryptionInstruction(accounts, new BN(1));
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "confirm_policy_decryption");
});

// configureConfidentialGuardrailsInstruction

test("configureConfidentialGuardrailsInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "owner",
      "treasury",
      "dailyLimitCiphertext",
      "perTxLimitCiphertext",
      "spentTodayCiphertext",
    ] as const),
  };
  const instruction = await client.configureConfidentialGuardrailsInstruction(
    accounts,
    new BN(1_700_000_000),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "configure_confidential_guardrails");
});

// configureConfidentialVectorGuardrailsInstruction

test("configureConfidentialVectorGuardrailsInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "owner",
      "treasury",
      "guardrailVectorCiphertext",
    ] as const),
  };
  const instruction = await client.configureConfidentialVectorGuardrailsInstruction(
    accounts,
    new BN(1_700_000_000),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "configure_confidential_vector_guardrails");
});

// proposeConfidentialTransactionInstruction

test("proposeConfidentialTransactionInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "aiAuthority",
      "treasury",
      "dailyLimitCiphertext",
      "perTxLimitCiphertext",
      "spentTodayCiphertext",
      "amountCiphertext",
      "policyOutputCiphertext",
      "encryptProgram",
      "config",
      "deposit",
      "callerProgram",
      "cpiAuthority",
      "networkEncryptionKey",
      "eventAuthority",
      "systemProgram",
    ] as const),
  };
  const instruction = await client.proposeConfidentialTransactionInstruction(
    accounts,
    defaultConfidentialArgs(),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "propose_confidential_transaction");
});

// proposeConfidentialVectorTransactionInstruction

test("proposeConfidentialVectorTransactionInstruction builds and decodes", async () => {
  const client = makeClient();
  const accounts = {
    ...randomAccounts([
      "aiAuthority",
      "treasury",
      "guardrailVectorCiphertext",
      "amountVectorCiphertext",
      "policyResultVectorCiphertext",
      "encryptProgram",
      "config",
      "deposit",
      "callerProgram",
      "cpiAuthority",
      "networkEncryptionKey",
      "eventAuthority",
      "systemProgram",
    ] as const),
  };
  const instruction = await client.proposeConfidentialVectorTransactionInstruction(
    accounts,
    defaultConfidentialArgs(),
  );
  const decoded = client.coder.decode(instruction.data);
  assert.ok(decoded);
  assert.equal(decoded?.name, "propose_confidential_vector_transaction");
});

// signer mismatch guards

test("executePending rejects signer mismatches before RPC", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.executePending(
      signer,
      {
        ...randomAccounts([
          "operator",
          "treasury",
          "messageApproval",
          "dwallet",
          "callerProgram",
          "cpiAuthority",
          "dwalletProgram",
          "dwalletCoordinator",
          "systemProgram",
        ] as const),
      },
      new BN(1),
    ),
    /operator/,
  );
});

test("configureConfidentialGuardrails rejects owner mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.configureConfidentialGuardrails(
      signer,
      {
        ...randomAccounts([
          "owner",
          "treasury",
          "dailyLimitCiphertext",
          "perTxLimitCiphertext",
          "spentTodayCiphertext",
        ] as const),
      },
      new BN(1),
    ),
    /owner/,
  );
});

test("configureConfidentialVectorGuardrails rejects owner mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.configureConfidentialVectorGuardrails(
      signer,
      {
        ...randomAccounts(["owner", "treasury", "guardrailVectorCiphertext"] as const),
      },
      new BN(1),
    ),
    /owner/,
  );
});

test("proposeConfidentialTransaction rejects aiAuthority mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.proposeConfidentialTransaction(
      signer,
      {
        ...randomAccounts([
          "aiAuthority",
          "treasury",
          "dailyLimitCiphertext",
          "perTxLimitCiphertext",
          "spentTodayCiphertext",
          "amountCiphertext",
          "policyOutputCiphertext",
          "encryptProgram",
          "config",
          "deposit",
          "callerProgram",
          "cpiAuthority",
          "networkEncryptionKey",
          "eventAuthority",
          "systemProgram",
        ] as const),
      },
      defaultConfidentialArgs(),
    ),
    /aiAuthority/,
  );
});

test("proposeConfidentialVectorTransaction rejects aiAuthority mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.proposeConfidentialVectorTransaction(
      signer,
      {
        ...randomAccounts([
          "aiAuthority",
          "treasury",
          "guardrailVectorCiphertext",
          "amountVectorCiphertext",
          "policyResultVectorCiphertext",
          "encryptProgram",
          "config",
          "deposit",
          "callerProgram",
          "cpiAuthority",
          "networkEncryptionKey",
          "eventAuthority",
          "systemProgram",
        ] as const),
      },
      defaultConfidentialArgs(),
    ),
    /aiAuthority/,
  );
});

test("requestPolicyDecryption rejects operator mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.requestPolicyDecryption(
      signer,
      {
        ...randomAccounts([
          "operator",
          "treasury",
          "requestAccount",
          "ciphertext",
          "encryptProgram",
          "config",
          "deposit",
          "callerProgram",
          "cpiAuthority",
          "networkEncryptionKey",
          "eventAuthority",
          "systemProgram",
        ] as const),
      },
      new BN(1),
    ),
    /operator/,
  );
});

test("confirmPolicyDecryption rejects operator mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.confirmPolicyDecryption(
      signer,
      {
        ...randomAccounts(["operator", "treasury", "requestAccount"] as const),
      },
      new BN(1),
    ),
    /operator/,
  );
});

test("finalizeExecution rejects operator mismatch", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.finalizeExecution(
      signer,
      {
        ...randomAccounts(["operator", "treasury", "messageApproval"] as const),
      },
      new BN(1),
    ),
    /operator/,
  );
});

function defaultSimulatePolicyArgs(): SimulatePolicyArgs {
  return {
    simulationId: new BN(1),
    amountUsd: new BN(250),
    targetChain: 2,
    txType: 0,
    protocolId: null,
    currentTimestamp: new BN(100),
    expectedOutputUsd: null,
    actualOutputUsd: null,
    quoteAgeSecs: null,
    counterpartyRiskScore: null,
    recipientOrContract: "recipient",
  };
}

function defaultWritePolicyReceiptArgs(): WritePolicyReceiptArgs {
  return { proposalId: new BN(1), now: new BN(100) };
}

function defaultApplyPolicyPresetArgs(): ApplyPolicyPresetArgs {
  return { presetKind: 1, now: new BN(100) };
}

function defaultConfigureBudgetEnvelopeArgs(): ConfigureBudgetEnvelopeArgs {
  return {
    envelopeId: new BN(1),
    scopeKind: 0,
    chain: 2,
    txType: null,
    protocolId: null,
    dailyLimitUsd: new BN(1_000),
    weeklyLimitUsd: new BN(5_000),
    now: new BN(100),
  };
}

function defaultInitExposureGroupArgs(): InitExposureGroupArgs {
  return {
    groupId: Array.from(new Uint8Array(16).fill(0x11)),
    dailyLimitUsd: new BN(10_000),
    nowDay: new BN(100),
  };
}

function defaultConfigureApprovalLadderArgs(): ConfigureApprovalLadderArgs {
  return {
    guardianAboveUsd: new BN(100),
    multisigAboveUsd: new BN(500),
    timelockAboveUsd: new BN(1_000),
    denyAboveUsd: new BN(5_000),
    riskGuardianBps: 2_500,
    riskMultisigBps: 5_000,
    riskTimelockBps: 7_500,
    timelockSecs: new BN(60),
    now: new BN(100),
  };
}

function defaultApprovePendingExecutionArgs(): ApprovePendingExecutionArgs {
  return { proposalId: new BN(1), approvalLevel: 1, now: new BN(100) };
}

function defaultSetScopedPauseArgs(): SetScopedPauseArgs {
  return {
    scopeKind: 0,
    chain: null,
    txType: null,
    recipient: null,
    protocolId: null,
    paused: true,
    expiresAt: null,
    now: new BN(100),
  };
}

function defaultGrantOperatorRoleArgs(): GrantOperatorRoleArgs {
  return {
    permissionMask: new BN(1),
    expiresAt: new BN(1_000),
    now: new BN(100),
  };
}

function defaultInitExternalLivenessArgs(): InitExternalLivenessArgs {
  return { maxStalenessSecs: new BN(300), now: new BN(100) };
}

function defaultConfigureLivenessGuardrailsArgs(): ConfigureLivenessGuardrailsArgs {
  return {
    requireEncryptFreshness: true,
    requireDwalletFreshness: true,
    requireBalanceOracleFreshness: false,
    requireComplianceOracleFreshness: false,
    maxStalenessSecs: new BN(300),
    now: new BN(100),
  };
}

function defaultRefreshExternalLivenessArgs(): RefreshExternalLivenessArgs {
  return { dependency: 1, now: new BN(100) };
}

function defaultAttestPolicyArgs(): AttestPolicyArgs {
  return {
    attestationKind: 1,
    expectedPolicyHash: Array.from(new Uint8Array(32).fill(0x22)),
    now: new BN(100),
  };
}

function defaultProposeBatchArgs(): ProposeBatchArgs {
  return {
    batchId: new BN(1),
    now: new BN(100),
    items: [
      {
        amountUsd: new BN(100),
        chain: 2,
        txType: 0,
        recipientOrContract: "recipient",
        protocolId: null,
      },
    ],
  };
}

function defaultCheckInvariantsArgs(): CheckInvariantsArgs {
  return { reportId: new BN(1), now: new BN(100) };
}

test("policy-control instruction builders decode", async () => {
  const client = makeClient();
  const owner = Keypair.generate().publicKey;
  const operator = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const attester = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const systemProgram = SystemProgram.programId;
  const accounts = randomAccounts([
    "budgetEnvelope",
    "exposureGroup",
    "operatorRole",
    "liveness",
    "simulationResult",
    "receipt",
    "attestation",
    "batch",
    "report",
  ] as const);

  const instructions = [
    await client.simulatePolicyInstruction(
      { payer, treasury, operatorRole: null, simulationResult: accounts.simulationResult, systemProgram },
      defaultSimulatePolicyArgs(),
    ),
    await client.writePolicyReceiptInstruction(
      { payer, treasury, receipt: accounts.receipt, attestation: null, systemProgram },
      defaultWritePolicyReceiptArgs(),
    ),
    await client.applyPolicyPresetInstruction(
      { owner, treasury },
      defaultApplyPolicyPresetArgs(),
    ),
    await client.configureBudgetEnvelopeInstruction(
      { owner, treasury, budgetEnvelope: accounts.budgetEnvelope, systemProgram },
      defaultConfigureBudgetEnvelopeArgs(),
    ),
    await client.initExposureGroupInstruction(
      { authority: owner, exposureGroup: accounts.exposureGroup, systemProgram },
      defaultInitExposureGroupArgs(),
    ),
    await client.joinExposureGroupInstruction({
      authority: owner,
      exposureGroup: accounts.exposureGroup,
      treasury,
    }),
    await client.configureApprovalLadderInstruction(
      { owner, treasury },
      defaultConfigureApprovalLadderArgs(),
    ),
    await client.approvePendingExecutionInstruction(
      { approver: owner, treasury },
      defaultApprovePendingExecutionArgs(),
    ),
    await client.setScopedPauseInstruction(
      { operator, treasury, operatorRole: null },
      defaultSetScopedPauseArgs(),
    ),
    await client.grantOperatorRoleInstruction(
      { owner, operator, treasury, operatorRole: accounts.operatorRole, systemProgram },
      defaultGrantOperatorRoleArgs(),
    ),
    await client.revokeOperatorRoleInstruction(
      { owner, treasury, operatorRole: accounts.operatorRole },
      new BN(100),
    ),
    await client.initExternalLivenessInstruction(
      { owner, treasury, liveness: accounts.liveness, systemProgram },
      defaultInitExternalLivenessArgs(),
    ),
    await client.configureLivenessGuardrailsInstruction(
      { owner, treasury },
      defaultConfigureLivenessGuardrailsArgs(),
    ),
    await client.refreshExternalLivenessInstruction(
      { operator, treasury, operatorRole: null, liveness: accounts.liveness },
      defaultRefreshExternalLivenessArgs(),
    ),
    await client.attestPolicyInstruction(
      { payer, attester, treasury, attestation: accounts.attestation, systemProgram },
      defaultAttestPolicyArgs(),
    ),
    await client.proposeBatchInstruction(
      { payer, treasury, batch: accounts.batch, systemProgram },
      defaultProposeBatchArgs(),
    ),
    await client.checkInvariantsInstruction(
      { payer, treasury, report: accounts.report, systemProgram },
      defaultCheckInvariantsArgs(),
    ),
  ];

  assert.deepEqual(
    instructions.map((instruction) => client.coder.decode(instruction.data)?.name),
    [
      "simulate_policy",
      "write_policy_receipt",
      "apply_policy_preset",
      "configure_budget_envelope",
      "init_exposure_group",
      "join_exposure_group",
      "configure_approval_ladder",
      "approve_pending_execution",
      "set_scoped_pause",
      "grant_operator_role",
      "revoke_operator_role",
      "init_external_liveness",
      "configure_liveness_guardrails",
      "refresh_external_liveness",
      "attest_policy",
      "propose_batch",
      "check_invariants",
    ],
  );
});

test("policy-control send helpers reject signer mismatches before RPC", async () => {
  const client = makeClient();
  const signer = Keypair.generate();
  await assert.rejects(
    client.configureApprovalLadder(
      signer,
      { owner: Keypair.generate().publicKey, treasury: Keypair.generate().publicKey },
      defaultConfigureApprovalLadderArgs(),
    ),
    /owner/,
  );
  await assert.rejects(
    client.refreshExternalLiveness(
      signer,
      {
        operator: Keypair.generate().publicKey,
        treasury: Keypair.generate().publicKey,
        operatorRole: null,
        liveness: Keypair.generate().publicKey,
      },
      defaultRefreshExternalLivenessArgs(),
    ),
    /operator/,
  );
});

// BNish coercion in instruction builders

test("cancelPendingInstruction accepts number timestamp", async () => {
  const client = makeClient();
  const instruction = await client.cancelPendingInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    12345,
  );
  assert.ok(client.coder.decode(instruction.data));
});

test("cancelPendingInstruction accepts bigint timestamp", async () => {
  const client = makeClient();
  const instruction = await client.cancelPendingInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    BigInt(12345),
  );
  assert.ok(client.coder.decode(instruction.data));
});

test("cancelPendingInstruction accepts string timestamp", async () => {
  const client = makeClient();
  const instruction = await client.cancelPendingInstruction(
    {
      owner: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
    },
    "12345",
  );
  assert.ok(client.coder.decode(instruction.data));
});
