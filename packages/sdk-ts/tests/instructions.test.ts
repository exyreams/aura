import assert from "node:assert/strict";
import test from "node:test";

import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  AURA_PROGRAM_ID,
  AuraClient,
  instructionBuilders,
  type CheckPolicyCpiArgs,
  type InitSwarmPoolArgs,
  type IssueSessionKeyArgs,
  type PolicyConfigRecord,
} from "../src/index.js";

function makeClient(): AuraClient {
  return new AuraClient({
    connection: new Connection("http://127.0.0.1:8899", "confirmed"),
  });
}

function pk(): PublicKey {
  return Keypair.generate().publicKey;
}

function policyConfigRecord(): PolicyConfigRecord {
  return {
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
  };
}

const issueSessionKeyArgs: IssueSessionKeyArgs = {
  sessionKey: pk(),
  durationSecs: new BN(3_600),
  maxAmountUsdPerTx: new BN(1_000),
  maxDailySpendUsd: new BN(5_000),
  allowedChains: Buffer.from([1, 2]),
  allowedTxTypes: Buffer.from([0, 1]),
  maxProposalCount: 10,
  now: new BN(42),
};

const checkPolicyCpiArgs: CheckPolicyCpiArgs = {
  amountUsd: new BN(250),
  targetChain: 2,
  txType: 0,
  protocolId: null,
  currentTimestamp: new BN(42),
  recipientOrContract: "recipient",
};

const initSwarmPoolArgs: InitSwarmPoolArgs = {
  swarmId: "swarm-alpha",
  sharedPoolLimitUsd: new BN(50_000),
  timestamp: new BN(42),
};

test("instructionBuilders: new advanced surface builds and decodes", async () => {
  const client = makeClient();
  const owner = pk();
  const guardian = pk();
  const operator = pk();
  const payer = pk();
  const authority = pk();
  const treasury = pk();
  const systemProgram = SystemProgram.programId;

  const ownerTreasury = { owner, treasury };
  const guardianTreasury = { guardian, treasury };
  const sessionKeyAccount = pk();
  const healthScore = pk();
  const policyHistory = pk();
  const snapshot = pk();
  const activityLog = pk();
  const swarmPool = pk();
  const feeVault = pk();
  const addressList = pk();

  const cases = [
    [
      "propose_ai_rotation",
      instructionBuilders.governance.proposeAiRotationInstruction(
        client,
        ownerTreasury,
        pk(),
        42,
      ),
    ],
    [
      "execute_ai_rotation",
      instructionBuilders.governance.executeAiRotationInstruction(client, ownerTreasury, 42),
    ],
    [
      "cancel_ai_rotation",
      instructionBuilders.governance.cancelAiRotationInstruction(client, ownerTreasury, 42),
    ],
    [
      "propose_guardian_rotation",
      instructionBuilders.governance.proposeGuardianRotationInstruction(
        client,
        guardianTreasury,
        0,
        pk(),
        42,
      ),
    ],
    [
      "execute_guardian_rotation",
      instructionBuilders.governance.executeGuardianRotationInstruction(
        client,
        guardianTreasury,
        42,
      ),
    ],
    [
      "propose_config_change",
      instructionBuilders.governance.proposeConfigChangeInstruction(
        client,
        ownerTreasury,
        1,
        policyConfigRecord(),
        42,
      ),
    ],
    [
      "execute_config_change",
      instructionBuilders.governance.executeConfigChangeInstruction(client, ownerTreasury, 1, 42),
    ],
    [
      "veto_config_change",
      instructionBuilders.governance.vetoConfigChangeInstruction(client, guardianTreasury, 1, 42),
    ],
    [
      "emergency_shutdown",
      instructionBuilders.governance.emergencyShutdownInstruction(client, ownerTreasury, pk(), 42),
    ],
    [
      "transition_agent_state",
      instructionBuilders.lifecycle.transitionAgentStateInstruction(client, ownerTreasury, 1, 42),
    ],
    [
      "migrate_treasury",
      instructionBuilders.lifecycle.migrateTreasuryInstruction(client, {
        treasury,
        payer,
        systemProgram,
      }),
    ],
    [
      "issue_session_key",
      instructionBuilders.lifecycle.issueSessionKeyInstruction(
        client,
        { authority, treasury, sessionKeyAccount, systemProgram },
        issueSessionKeyArgs,
      ),
    ],
    [
      "revoke_session_key",
      instructionBuilders.lifecycle.revokeSessionKeyInstruction(
        client,
        { authority, treasury, sessionKeyAccount },
        42,
      ),
    ],
    [
      "close_session_key",
      instructionBuilders.lifecycle.closeSessionKeyInstruction(client, {
        authority,
        treasury,
        sessionKeyAccount,
      }),
    ],
    [
      "trigger_dead_mans_switch",
      instructionBuilders.lifecycle.triggerDeadMansSwitchInstruction(client, { treasury }, 42),
    ],
    [
      "check_policy_cpi",
      instructionBuilders.policy.checkPolicyCpiInstruction(
        client,
        { caller: pk(), treasury, feePayer: payer, result: pk(), systemProgram },
        checkPolicyCpiArgs,
      ),
    ],
    [
      "init_health_score",
      instructionBuilders.operational.initHealthScoreInstruction(
        client,
        { owner, treasury, healthScore, systemProgram },
        42,
      ),
    ],
    [
      "refresh_health_score",
      instructionBuilders.operational.refreshHealthScoreInstruction(
        client,
        { operator, treasury, operatorRole: null, healthScore },
        42,
      ),
    ],
    [
      "close_health_score",
      instructionBuilders.operational.closeHealthScoreInstruction(client, {
        owner,
        treasury,
        healthScore,
      }),
    ],
    [
      "take_snapshot",
      instructionBuilders.operational.takeSnapshotInstruction(
        client,
        { payer, treasury, operatorRole: null, healthScore, snapshot, systemProgram },
        7,
        42,
      ),
    ],
    [
      "record_policy_snapshot",
      instructionBuilders.policy.recordPolicySnapshotInstruction(
        client,
        { owner, treasury, policyHistory, systemProgram },
        42,
      ),
    ],
    [
      "close_snapshot",
      instructionBuilders.operational.closeSnapshotInstruction(client, {
        owner,
        treasury,
        snapshot,
      }),
    ],
    [
      "init_activity_log",
      instructionBuilders.operational.initActivityLogInstruction(client, {
        owner,
        treasury,
        activityLog,
        systemProgram,
      }),
    ],
    [
      "close_activity_log",
      instructionBuilders.operational.closeActivityLogInstruction(client, {
        owner,
        treasury,
        activityLog,
      }),
    ],
    [
      "init_swarm_pool",
      instructionBuilders.swarm.initSwarmPoolInstruction(
        client,
        { creator: payer, swarmPool, systemProgram },
        initSwarmPoolArgs,
      ),
    ],
    [
      "join_swarm",
      instructionBuilders.swarm.joinSwarmInstruction(client, { owner, treasury, swarmPool }, 42),
    ],
    [
      "init_fee_vault",
      instructionBuilders.fees.initFeeVaultInstruction(
        client,
        { owner, treasury, feeVault, systemProgram },
        pk(),
        42,
      ),
    ],
    [
      "collect_fees",
      instructionBuilders.fees.collectFeesInstruction(
        client,
        { protocolAuthority: payer, feeVault, recipient: payer },
        42,
      ),
    ],
    [
      "close_fee_vault",
      instructionBuilders.fees.closeFeeVaultInstruction(client, { owner, treasury, feeVault }),
    ],
    [
      "init_address_list",
      instructionBuilders.addressLists.initAddressListInstruction(
        client,
        { owner, treasury, addressList, systemProgram },
        1,
        2,
        42,
      ),
    ],
    [
      "manage_address_list",
      instructionBuilders.addressLists.manageAddressListInstruction(
        client,
        { operator, treasury, operatorRole: null, addressList },
        1,
        2,
        ["0xabc"],
        42,
      ),
    ],
    [
      "close_address_list",
      instructionBuilders.addressLists.closeAddressListInstruction(client, {
        owner,
        treasury,
        addressList,
      }),
    ],
    [
      "init_policy_history",
      instructionBuilders.policy.initPolicyHistoryInstruction(client, {
        owner,
        treasury,
        policyHistory,
        systemProgram,
      }),
    ],
    [
      "close_policy_history",
      instructionBuilders.policy.closePolicyHistoryInstruction(client, {
        owner,
        treasury,
        policyHistory,
      }),
    ],
    [
      "refresh_dwallet_balance",
      instructionBuilders.dwallet.refreshDwalletBalanceInstruction(
        client,
        { treasury, balanceOracle: pk() },
        2,
        42,
      ),
    ],
  ] as const;

  for (const [expectedName, instructionPromise] of cases) {
    const instruction = await instructionPromise;
    const decoded = client.coder.decode(instruction.data);
    assert.equal(instruction.programId.toBase58(), AURA_PROGRAM_ID.toBase58());
    assert.equal(decoded?.name, expectedName);
  }
});

test("instructionBuilders: guardian rotation uses guardian account order", async () => {
  const client = makeClient();
  const guardian = pk();
  const treasury = pk();
  const instruction = await instructionBuilders.governance.executeGuardianRotationInstruction(
    client,
    { guardian, treasury },
    42,
  );

  assert.equal(instruction.keys[0]?.pubkey.toBase58(), guardian.toBase58());
  assert.equal(instruction.keys[1]?.pubkey.toBase58(), treasury.toBase58());
});
