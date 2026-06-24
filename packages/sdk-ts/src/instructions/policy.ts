/** Generated instruction builders for the policy domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `apply_policy_preset` instruction. */
export type ApplyPolicyPresetInput = {
  accounts: MethodAccounts<"applyPolicyPreset">;
  args: MethodArgs<"applyPolicyPreset">[0];
};

/** Builds a `apply_policy_preset` instruction. */
export function applyPolicyPreset(
  client: AuraClient,
  input: ApplyPolicyPresetInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .applyPolicyPreset(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const applyPolicyPresetInstruction = applyPolicyPreset;

/** Builds and sends a `apply_policy_preset` transaction. */
export async function sendApplyPolicyPreset(
  client: AuraClient,
  payer: Signer,
  input: ApplyPolicyPresetInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await applyPolicyPreset(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `apply_policy_template` instruction. */
export type ApplyPolicyTemplateInput = {
  accounts: MethodAccounts<"applyPolicyTemplate">;
  args: {
    now: MethodArgs<"applyPolicyTemplate">[0];
  };
};

/** Builds a `apply_policy_template` instruction. */
export function applyPolicyTemplate(
  client: AuraClient,
  input: ApplyPolicyTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .applyPolicyTemplate(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const applyPolicyTemplateInstruction = applyPolicyTemplate;

/** Builds and sends a `apply_policy_template` transaction. */
export async function sendApplyPolicyTemplate(
  client: AuraClient,
  payer: Signer,
  input: ApplyPolicyTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await applyPolicyTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `apply_policy_template_parameterized` instruction. */
export type ApplyPolicyTemplateParameterizedInput = {
  accounts: MethodAccounts<"applyPolicyTemplateParameterized">;
  args: {
    overrides: MethodArgs<"applyPolicyTemplateParameterized">[0];
    now: MethodArgs<"applyPolicyTemplateParameterized">[1];
  };
};

/** Builds a `apply_policy_template_parameterized` instruction. */
export function applyPolicyTemplateParameterized(
  client: AuraClient,
  input: ApplyPolicyTemplateParameterizedInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .applyPolicyTemplateParameterized(input.args.overrides, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const applyPolicyTemplateParameterizedInstruction =
  applyPolicyTemplateParameterized;

/** Builds and sends a `apply_policy_template_parameterized` transaction. */
export async function sendApplyPolicyTemplateParameterized(
  client: AuraClient,
  payer: Signer,
  input: ApplyPolicyTemplateParameterizedInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await applyPolicyTemplateParameterized(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `attest_policy` instruction. */
export type AttestPolicyInput = {
  accounts: MethodAccounts<"attestPolicy">;
  args: MethodArgs<"attestPolicy">[0];
};

/** Builds a `attest_policy` instruction. */
export function attestPolicy(
  client: AuraClient,
  input: AttestPolicyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .attestPolicy(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const attestPolicyInstruction = attestPolicy;

/** Builds and sends a `attest_policy` transaction. */
export async function sendAttestPolicy(
  client: AuraClient,
  payer: Signer,
  input: AttestPolicyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await attestPolicy(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `check_invariants` instruction. */
export type CheckInvariantsInput = {
  accounts: MethodAccounts<"checkInvariants">;
  args: MethodArgs<"checkInvariants">[0];
};

/** Builds a `check_invariants` instruction. */
export function checkInvariants(
  client: AuraClient,
  input: CheckInvariantsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .checkInvariants(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const checkInvariantsInstruction = checkInvariants;

/** Builds and sends a `check_invariants` transaction. */
export async function sendCheckInvariants(
  client: AuraClient,
  payer: Signer,
  input: CheckInvariantsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await checkInvariants(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `check_policy_cpi` instruction. */
export type CheckPolicyCpiInput = {
  accounts: MethodAccounts<"checkPolicyCpi">;
  args: MethodArgs<"checkPolicyCpi">[0];
};

/** Builds a `check_policy_cpi` instruction. */
export function checkPolicyCpi(
  client: AuraClient,
  input: CheckPolicyCpiInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .checkPolicyCpi(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const checkPolicyCpiInstruction = checkPolicyCpi;

/** Builds and sends a `check_policy_cpi` transaction. */
export async function sendCheckPolicyCpi(
  client: AuraClient,
  payer: Signer,
  input: CheckPolicyCpiInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await checkPolicyCpi(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_policy_history` instruction. */
export type ClosePolicyHistoryInput = {
  accounts: MethodAccounts<"closePolicyHistory">;
  args?: undefined;
};

/** Builds a `close_policy_history` instruction. */
export function closePolicyHistory(
  client: AuraClient,
  input: ClosePolicyHistoryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closePolicyHistory()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closePolicyHistoryInstruction = closePolicyHistory;

/** Builds and sends a `close_policy_history` transaction. */
export async function sendClosePolicyHistory(
  client: AuraClient,
  payer: Signer,
  input: ClosePolicyHistoryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closePolicyHistory(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_policy_template` instruction. */
export type ClosePolicyTemplateInput = {
  accounts: MethodAccounts<"closePolicyTemplate">;
  args?: undefined;
};

/** Builds a `close_policy_template` instruction. */
export function closePolicyTemplate(
  client: AuraClient,
  input: ClosePolicyTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closePolicyTemplate()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closePolicyTemplateInstruction = closePolicyTemplate;

/** Builds and sends a `close_policy_template` transaction. */
export async function sendClosePolicyTemplate(
  client: AuraClient,
  payer: Signer,
  input: ClosePolicyTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closePolicyTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_trust_policy` instruction. */
export type ConfigureTrustPolicyInput = {
  accounts: MethodAccounts<"configureTrustPolicy">;
  args: MethodArgs<"configureTrustPolicy">[0];
};

/** Builds a `configure_trust_policy` instruction. */
export function configureTrustPolicy(
  client: AuraClient,
  input: ConfigureTrustPolicyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureTrustPolicy(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureTrustPolicyInstruction = configureTrustPolicy;

/** Builds and sends a `configure_trust_policy` transaction. */
export async function sendConfigureTrustPolicy(
  client: AuraClient,
  payer: Signer,
  input: ConfigureTrustPolicyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureTrustPolicy(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `create_policy_template` instruction. */
export type CreatePolicyTemplateInput = {
  accounts: MethodAccounts<"createPolicyTemplate">;
  args: MethodArgs<"createPolicyTemplate">[0];
};

/** Builds a `create_policy_template` instruction. */
export function createPolicyTemplate(
  client: AuraClient,
  input: CreatePolicyTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .createPolicyTemplate(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const createPolicyTemplateInstruction = createPolicyTemplate;

/** Builds and sends a `create_policy_template` transaction. */
export async function sendCreatePolicyTemplate(
  client: AuraClient,
  payer: Signer,
  input: CreatePolicyTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await createPolicyTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `discard_canary` instruction. */
export type DiscardCanaryInput = {
  accounts: MethodAccounts<"discardCanary">;
  args?: undefined;
};

/** Builds a `discard_canary` instruction. */
export function discardCanary(
  client: AuraClient,
  input: DiscardCanaryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .discardCanary()
    .accountsStrict(input.accounts)
    .instruction();
}

export const discardCanaryInstruction = discardCanary;

/** Builds and sends a `discard_canary` transaction. */
export async function sendDiscardCanary(
  client: AuraClient,
  payer: Signer,
  input: DiscardCanaryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await discardCanary(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_policy_history` instruction. */
export type InitPolicyHistoryInput = {
  accounts: MethodAccounts<"initPolicyHistory">;
  args?: undefined;
};

/** Builds a `init_policy_history` instruction. */
export function initPolicyHistory(
  client: AuraClient,
  input: InitPolicyHistoryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initPolicyHistory()
    .accountsStrict(input.accounts)
    .instruction();
}

export const initPolicyHistoryInstruction = initPolicyHistory;

/** Builds and sends a `init_policy_history` transaction. */
export async function sendInitPolicyHistory(
  client: AuraClient,
  payer: Signer,
  input: InitPolicyHistoryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initPolicyHistory(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_trust_identity` instruction. */
export type InitTrustIdentityInput = {
  accounts: MethodAccounts<"initTrustIdentity">;
  args: {
    now: MethodArgs<"initTrustIdentity">[0];
  };
};

/** Builds a `init_trust_identity` instruction. */
export function initTrustIdentity(
  client: AuraClient,
  input: InitTrustIdentityInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initTrustIdentity(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initTrustIdentityInstruction = initTrustIdentity;

/** Builds and sends a `init_trust_identity` transaction. */
export async function sendInitTrustIdentity(
  client: AuraClient,
  payer: Signer,
  input: InitTrustIdentityInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initTrustIdentity(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `promote_canary` instruction. */
export type PromoteCanaryInput = {
  accounts: MethodAccounts<"promoteCanary">;
  args: {
    now: MethodArgs<"promoteCanary">[0];
  };
};

/** Builds a `promote_canary` instruction. */
export function promoteCanary(
  client: AuraClient,
  input: PromoteCanaryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .promoteCanary(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const promoteCanaryInstruction = promoteCanary;

/** Builds and sends a `promote_canary` transaction. */
export async function sendPromoteCanary(
  client: AuraClient,
  payer: Signer,
  input: PromoteCanaryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await promoteCanary(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `record_policy_snapshot` instruction. */
export type RecordPolicySnapshotInput = {
  accounts: MethodAccounts<"recordPolicySnapshot">;
  args: {
    now: MethodArgs<"recordPolicySnapshot">[0];
  };
};

/** Builds a `record_policy_snapshot` instruction. */
export function recordPolicySnapshot(
  client: AuraClient,
  input: RecordPolicySnapshotInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .recordPolicySnapshot(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const recordPolicySnapshotInstruction = recordPolicySnapshot;

/** Builds and sends a `record_policy_snapshot` transaction. */
export async function sendRecordPolicySnapshot(
  client: AuraClient,
  payer: Signer,
  input: RecordPolicySnapshotInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await recordPolicySnapshot(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `restore_trust` instruction. */
export type RestoreTrustInput = {
  accounts: MethodAccounts<"restoreTrust">;
  args: {
    now: MethodArgs<"restoreTrust">[0];
  };
};

/** Builds a `restore_trust` instruction. */
export function restoreTrust(
  client: AuraClient,
  input: RestoreTrustInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .restoreTrust(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const restoreTrustInstruction = restoreTrust;

/** Builds and sends a `restore_trust` transaction. */
export async function sendRestoreTrust(
  client: AuraClient,
  payer: Signer,
  input: RestoreTrustInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await restoreTrust(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `rollback_policy` instruction. */
export type RollbackPolicyInput = {
  accounts: MethodAccounts<"rollbackPolicy">;
  args: {
    targetVersion: MethodArgs<"rollbackPolicy">[0];
    candidate: MethodArgs<"rollbackPolicy">[1];
    now: MethodArgs<"rollbackPolicy">[2];
  };
};

/** Builds a `rollback_policy` instruction. */
export function rollbackPolicy(
  client: AuraClient,
  input: RollbackPolicyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .rollbackPolicy(
      input.args.targetVersion,
      input.args.candidate,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const rollbackPolicyInstruction = rollbackPolicy;

/** Builds and sends a `rollback_policy` transaction. */
export async function sendRollbackPolicy(
  client: AuraClient,
  payer: Signer,
  input: RollbackPolicyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await rollbackPolicy(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `simulate_policy` instruction. */
export type SimulatePolicyInput = {
  accounts: MethodAccounts<"simulatePolicy">;
  args: MethodArgs<"simulatePolicy">[0];
};

/** Builds a `simulate_policy` instruction. */
export function simulatePolicy(
  client: AuraClient,
  input: SimulatePolicyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .simulatePolicy(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const simulatePolicyInstruction = simulatePolicy;

/** Builds and sends a `simulate_policy` transaction. */
export async function sendSimulatePolicy(
  client: AuraClient,
  payer: Signer,
  input: SimulatePolicyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await simulatePolicy(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `start_canary` instruction. */
export type StartCanaryInput = {
  accounts: MethodAccounts<"startCanary">;
  args: {
    candidate: MethodArgs<"startCanary">[0];
    sampleCap: MethodArgs<"startCanary">[1];
    now: MethodArgs<"startCanary">[2];
  };
};

/** Builds a `start_canary` instruction. */
export function startCanary(
  client: AuraClient,
  input: StartCanaryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .startCanary(input.args.candidate, input.args.sampleCap, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const startCanaryInstruction = startCanary;

/** Builds and sends a `start_canary` transaction. */
export async function sendStartCanary(
  client: AuraClient,
  payer: Signer,
  input: StartCanaryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await startCanary(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_policy_template` instruction. */
export type UpdatePolicyTemplateInput = {
  accounts: MethodAccounts<"updatePolicyTemplate">;
  args: MethodArgs<"updatePolicyTemplate">[0];
};

/** Builds a `update_policy_template` instruction. */
export function updatePolicyTemplate(
  client: AuraClient,
  input: UpdatePolicyTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updatePolicyTemplate(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updatePolicyTemplateInstruction = updatePolicyTemplate;

/** Builds and sends a `update_policy_template` transaction. */
export async function sendUpdatePolicyTemplate(
  client: AuraClient,
  payer: Signer,
  input: UpdatePolicyTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updatePolicyTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `write_policy_receipt` instruction. */
export type WritePolicyReceiptInput = {
  accounts: MethodAccounts<"writePolicyReceipt">;
  args: MethodArgs<"writePolicyReceipt">[0];
};

/** Builds a `write_policy_receipt` instruction. */
export function writePolicyReceipt(
  client: AuraClient,
  input: WritePolicyReceiptInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .writePolicyReceipt(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const writePolicyReceiptInstruction = writePolicyReceipt;

/** Builds and sends a `write_policy_receipt` transaction. */
export async function sendWritePolicyReceipt(
  client: AuraClient,
  payer: Signer,
  input: WritePolicyReceiptInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await writePolicyReceipt(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
