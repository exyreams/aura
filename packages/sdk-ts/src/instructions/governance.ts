/** Generated instruction builders for the governance domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `break_glass_recover` instruction. */
export type BreakGlassRecoverInput = {
  accounts: MethodAccounts<"breakGlassRecover">;
  args: MethodArgs<"breakGlassRecover">[0];
};

/** Builds a `break_glass_recover` instruction. */
export function breakGlassRecover(
  client: AuraClient,
  input: BreakGlassRecoverInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .breakGlassRecover(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const breakGlassRecoverInstruction = breakGlassRecover;

/** Builds and sends a `break_glass_recover` transaction. */
export async function sendBreakGlassRecover(
  client: AuraClient,
  payer: Signer,
  input: BreakGlassRecoverInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await breakGlassRecover(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `break_glass_transfer_authority` instruction. */
export type BreakGlassTransferAuthorityInput = {
  accounts: MethodAccounts<"breakGlassTransferAuthority">;
  args: MethodArgs<"breakGlassTransferAuthority">[0];
};

/** Builds a `break_glass_transfer_authority` instruction. */
export function breakGlassTransferAuthority(
  client: AuraClient,
  input: BreakGlassTransferAuthorityInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .breakGlassTransferAuthority(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const breakGlassTransferAuthorityInstruction =
  breakGlassTransferAuthority;

/** Builds and sends a `break_glass_transfer_authority` transaction. */
export async function sendBreakGlassTransferAuthority(
  client: AuraClient,
  payer: Signer,
  input: BreakGlassTransferAuthorityInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await breakGlassTransferAuthority(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `cancel_ai_rotation` instruction. */
export type CancelAiRotationInput = {
  accounts: MethodAccounts<"cancelAiRotation">;
  args: {
    now: MethodArgs<"cancelAiRotation">[0];
  };
};

/** Builds a `cancel_ai_rotation` instruction. */
export function cancelAiRotation(
  client: AuraClient,
  input: CancelAiRotationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .cancelAiRotation(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const cancelAiRotationInstruction = cancelAiRotation;

/** Builds and sends a `cancel_ai_rotation` transaction. */
export async function sendCancelAiRotation(
  client: AuraClient,
  payer: Signer,
  input: CancelAiRotationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await cancelAiRotation(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `collect_override_signature` instruction. */
export type CollectOverrideSignatureInput = {
  accounts: MethodAccounts<"collectOverrideSignature">;
  args: {
    now: MethodArgs<"collectOverrideSignature">[0];
  };
};

/** Builds a `collect_override_signature` instruction. */
export function collectOverrideSignature(
  client: AuraClient,
  input: CollectOverrideSignatureInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .collectOverrideSignature(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const collectOverrideSignatureInstruction = collectOverrideSignature;

/** Builds and sends a `collect_override_signature` transaction. */
export async function sendCollectOverrideSignature(
  client: AuraClient,
  payer: Signer,
  input: CollectOverrideSignatureInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await collectOverrideSignature(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_multisig` instruction. */
export type ConfigureMultisigInput = {
  accounts: MethodAccounts<"configureMultisig">;
  args: MethodArgs<"configureMultisig">[0];
};

/** Builds a `configure_multisig` instruction. */
export function configureMultisig(
  client: AuraClient,
  input: ConfigureMultisigInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureMultisig(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureMultisigInstruction = configureMultisig;

/** Builds and sends a `configure_multisig` transaction. */
export async function sendConfigureMultisig(
  client: AuraClient,
  payer: Signer,
  input: ConfigureMultisigInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureMultisig(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `emergency_shutdown` instruction. */
export type EmergencyShutdownInput = {
  accounts: MethodAccounts<"emergencyShutdown">;
  args: {
    recoveryPubkey: MethodArgs<"emergencyShutdown">[0];
    now: MethodArgs<"emergencyShutdown">[1];
  };
};

/** Builds a `emergency_shutdown` instruction. */
export function emergencyShutdown(
  client: AuraClient,
  input: EmergencyShutdownInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .emergencyShutdown(input.args.recoveryPubkey, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const emergencyShutdownInstruction = emergencyShutdown;

/** Builds and sends a `emergency_shutdown` transaction. */
export async function sendEmergencyShutdown(
  client: AuraClient,
  payer: Signer,
  input: EmergencyShutdownInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await emergencyShutdown(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_ai_rotation` instruction. */
export type ExecuteAiRotationInput = {
  accounts: MethodAccounts<"executeAiRotation">;
  args: {
    now: MethodArgs<"executeAiRotation">[0];
  };
};

/** Builds a `execute_ai_rotation` instruction. */
export function executeAiRotation(
  client: AuraClient,
  input: ExecuteAiRotationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executeAiRotation(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const executeAiRotationInstruction = executeAiRotation;

/** Builds and sends a `execute_ai_rotation` transaction. */
export async function sendExecuteAiRotation(
  client: AuraClient,
  payer: Signer,
  input: ExecuteAiRotationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executeAiRotation(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_config_change` instruction. */
export type ExecuteConfigChangeInput = {
  accounts: MethodAccounts<"executeConfigChange">;
  args: {
    changeId: MethodArgs<"executeConfigChange">[0];
    now: MethodArgs<"executeConfigChange">[1];
  };
};

/** Builds a `execute_config_change` instruction. */
export function executeConfigChange(
  client: AuraClient,
  input: ExecuteConfigChangeInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executeConfigChange(input.args.changeId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const executeConfigChangeInstruction = executeConfigChange;

/** Builds and sends a `execute_config_change` transaction. */
export async function sendExecuteConfigChange(
  client: AuraClient,
  payer: Signer,
  input: ExecuteConfigChangeInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executeConfigChange(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_guardian_rotation` instruction. */
export type ExecuteGuardianRotationInput = {
  accounts: MethodAccounts<"executeGuardianRotation">;
  args: {
    now: MethodArgs<"executeGuardianRotation">[0];
  };
};

/** Builds a `execute_guardian_rotation` instruction. */
export function executeGuardianRotation(
  client: AuraClient,
  input: ExecuteGuardianRotationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executeGuardianRotation(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const executeGuardianRotationInstruction = executeGuardianRotation;

/** Builds and sends a `execute_guardian_rotation` transaction. */
export async function sendExecuteGuardianRotation(
  client: AuraClient,
  payer: Signer,
  input: ExecuteGuardianRotationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executeGuardianRotation(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_ai_rotation` instruction. */
export type ProposeAiRotationInput = {
  accounts: MethodAccounts<"proposeAiRotation">;
  args: {
    newAiAuthority: MethodArgs<"proposeAiRotation">[0];
    now: MethodArgs<"proposeAiRotation">[1];
  };
};

/** Builds a `propose_ai_rotation` instruction. */
export function proposeAiRotation(
  client: AuraClient,
  input: ProposeAiRotationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeAiRotation(input.args.newAiAuthority, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeAiRotationInstruction = proposeAiRotation;

/** Builds and sends a `propose_ai_rotation` transaction. */
export async function sendProposeAiRotation(
  client: AuraClient,
  payer: Signer,
  input: ProposeAiRotationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeAiRotation(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_config_change` instruction. */
export type ProposeConfigChangeInput = {
  accounts: MethodAccounts<"proposeConfigChange">;
  args: {
    changeId: MethodArgs<"proposeConfigChange">[0];
    newPolicyConfig: MethodArgs<"proposeConfigChange">[1];
    now: MethodArgs<"proposeConfigChange">[2];
  };
};

/** Builds a `propose_config_change` instruction. */
export function proposeConfigChange(
  client: AuraClient,
  input: ProposeConfigChangeInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeConfigChange(
      input.args.changeId,
      input.args.newPolicyConfig,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeConfigChangeInstruction = proposeConfigChange;

/** Builds and sends a `propose_config_change` transaction. */
export async function sendProposeConfigChange(
  client: AuraClient,
  payer: Signer,
  input: ProposeConfigChangeInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeConfigChange(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_guardian_rotation` instruction. */
export type ProposeGuardianRotationInput = {
  accounts: MethodAccounts<"proposeGuardianRotation">;
  args: {
    action: MethodArgs<"proposeGuardianRotation">[0];
    targetGuardian: MethodArgs<"proposeGuardianRotation">[1];
    now: MethodArgs<"proposeGuardianRotation">[2];
  };
};

/** Builds a `propose_guardian_rotation` instruction. */
export function proposeGuardianRotation(
  client: AuraClient,
  input: ProposeGuardianRotationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeGuardianRotation(
      input.args.action,
      input.args.targetGuardian,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeGuardianRotationInstruction = proposeGuardianRotation;

/** Builds and sends a `propose_guardian_rotation` transaction. */
export async function sendProposeGuardianRotation(
  client: AuraClient,
  payer: Signer,
  input: ProposeGuardianRotationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeGuardianRotation(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_override` instruction. */
export type ProposeOverrideInput = {
  accounts: MethodAccounts<"proposeOverride">;
  args: {
    newDailyLimitUsd: MethodArgs<"proposeOverride">[0];
    now: MethodArgs<"proposeOverride">[1];
  };
};

/** Builds a `propose_override` instruction. */
export function proposeOverride(
  client: AuraClient,
  input: ProposeOverrideInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeOverride(input.args.newDailyLimitUsd, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeOverrideInstruction = proposeOverride;

/** Builds and sends a `propose_override` transaction. */
export async function sendProposeOverride(
  client: AuraClient,
  payer: Signer,
  input: ProposeOverrideInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeOverride(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `register_recovery_destination` instruction. */
export type RegisterRecoveryDestinationInput = {
  accounts: MethodAccounts<"registerRecoveryDestination">;
  args: MethodArgs<"registerRecoveryDestination">[0];
};

/** Builds a `register_recovery_destination` instruction. */
export function registerRecoveryDestination(
  client: AuraClient,
  input: RegisterRecoveryDestinationInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .registerRecoveryDestination(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const registerRecoveryDestinationInstruction =
  registerRecoveryDestination;

/** Builds and sends a `register_recovery_destination` transaction. */
export async function sendRegisterRecoveryDestination(
  client: AuraClient,
  payer: Signer,
  input: RegisterRecoveryDestinationInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await registerRecoveryDestination(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `veto_config_change` instruction. */
export type VetoConfigChangeInput = {
  accounts: MethodAccounts<"vetoConfigChange">;
  args: {
    changeId: MethodArgs<"vetoConfigChange">[0];
    now: MethodArgs<"vetoConfigChange">[1];
  };
};

/** Builds a `veto_config_change` instruction. */
export function vetoConfigChange(
  client: AuraClient,
  input: VetoConfigChangeInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .vetoConfigChange(input.args.changeId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const vetoConfigChangeInstruction = vetoConfigChange;

/** Builds and sends a `veto_config_change` transaction. */
export async function sendVetoConfigChange(
  client: AuraClient,
  payer: Signer,
  input: VetoConfigChangeInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await vetoConfigChange(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
