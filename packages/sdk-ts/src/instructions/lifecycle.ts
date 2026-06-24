/** Generated instruction builders for the lifecycle domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `arm_capability_loosen` instruction. */
export type ArmCapabilityLoosenInput = {
  accounts: MethodAccounts<"armCapabilityLoosen">;
  args: {
    key: MethodArgs<"armCapabilityLoosen">[0];
    now: MethodArgs<"armCapabilityLoosen">[1];
  };
};

/** Builds a `arm_capability_loosen` instruction. */
export function armCapabilityLoosen(
  client: AuraClient,
  input: ArmCapabilityLoosenInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .armCapabilityLoosen(input.args.key, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const armCapabilityLoosenInstruction = armCapabilityLoosen;

/** Builds and sends a `arm_capability_loosen` transaction. */
export async function sendArmCapabilityLoosen(
  client: AuraClient,
  payer: Signer,
  input: ArmCapabilityLoosenInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await armCapabilityLoosen(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_session_key` instruction. */
export type CloseSessionKeyInput = {
  accounts: MethodAccounts<"closeSessionKey">;
  args?: undefined;
};

/** Builds a `close_session_key` instruction. */
export function closeSessionKey(
  client: AuraClient,
  input: CloseSessionKeyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeSessionKey()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeSessionKeyInstruction = closeSessionKey;

/** Builds and sends a `close_session_key` transaction. */
export async function sendCloseSessionKey(
  client: AuraClient,
  payer: Signer,
  input: CloseSessionKeyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeSessionKey(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `commit_protocol_config` instruction. */
export type CommitProtocolConfigInput = {
  accounts: MethodAccounts<"commitProtocolConfig">;
  args: {
    now: MethodArgs<"commitProtocolConfig">[0];
  };
};

/** Builds a `commit_protocol_config` instruction. */
export function commitProtocolConfig(
  client: AuraClient,
  input: CommitProtocolConfigInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .commitProtocolConfig(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const commitProtocolConfigInstruction = commitProtocolConfig;

/** Builds and sends a `commit_protocol_config` transaction. */
export async function sendCommitProtocolConfig(
  client: AuraClient,
  payer: Signer,
  input: CommitProtocolConfigInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await commitProtocolConfig(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `emergency_revoke_agent` instruction. */
export type EmergencyRevokeAgentInput = {
  accounts: MethodAccounts<"emergencyRevokeAgent">;
  args: {
    key: MethodArgs<"emergencyRevokeAgent">[0];
    now: MethodArgs<"emergencyRevokeAgent">[1];
  };
};

/** Builds a `emergency_revoke_agent` instruction. */
export function emergencyRevokeAgent(
  client: AuraClient,
  input: EmergencyRevokeAgentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .emergencyRevokeAgent(input.args.key, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const emergencyRevokeAgentInstruction = emergencyRevokeAgent;

/** Builds and sends a `emergency_revoke_agent` transaction. */
export async function sendEmergencyRevokeAgent(
  client: AuraClient,
  payer: Signer,
  input: EmergencyRevokeAgentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await emergencyRevokeAgent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_ownership_handover` instruction. */
export type ExecuteOwnershipHandoverInput = {
  accounts: MethodAccounts<"executeOwnershipHandover">;
  args: MethodArgs<"executeOwnershipHandover">[0];
};

/** Builds a `execute_ownership_handover` instruction. */
export function executeOwnershipHandover(
  client: AuraClient,
  input: ExecuteOwnershipHandoverInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executeOwnershipHandover(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const executeOwnershipHandoverInstruction = executeOwnershipHandover;

/** Builds and sends a `execute_ownership_handover` transaction. */
export async function sendExecuteOwnershipHandover(
  client: AuraClient,
  payer: Signer,
  input: ExecuteOwnershipHandoverInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executeOwnershipHandover(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `grant_operator_role` instruction. */
export type GrantOperatorRoleInput = {
  accounts: MethodAccounts<"grantOperatorRole">;
  args: MethodArgs<"grantOperatorRole">[0];
};

/** Builds a `grant_operator_role` instruction. */
export function grantOperatorRole(
  client: AuraClient,
  input: GrantOperatorRoleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .grantOperatorRole(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const grantOperatorRoleInstruction = grantOperatorRole;

/** Builds and sends a `grant_operator_role` transaction. */
export async function sendGrantOperatorRole(
  client: AuraClient,
  payer: Signer,
  input: GrantOperatorRoleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await grantOperatorRole(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_protocol_config` instruction. */
export type InitProtocolConfigInput = {
  accounts: MethodAccounts<"initProtocolConfig">;
  args: {
    args: MethodArgs<"initProtocolConfig">[0];
    now: MethodArgs<"initProtocolConfig">[1];
  };
};

/** Builds a `init_protocol_config` instruction. */
export function initProtocolConfig(
  client: AuraClient,
  input: InitProtocolConfigInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initProtocolConfig(input.args.args, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initProtocolConfigInstruction = initProtocolConfig;

/** Builds and sends a `init_protocol_config` transaction. */
export async function sendInitProtocolConfig(
  client: AuraClient,
  payer: Signer,
  input: InitProtocolConfigInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initProtocolConfig(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `issue_session_key` instruction. */
export type IssueSessionKeyInput = {
  accounts: MethodAccounts<"issueSessionKey">;
  args: MethodArgs<"issueSessionKey">[0];
};

/** Builds a `issue_session_key` instruction. */
export function issueSessionKey(
  client: AuraClient,
  input: IssueSessionKeyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .issueSessionKey(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const issueSessionKeyInstruction = issueSessionKey;

/** Builds and sends a `issue_session_key` transaction. */
export async function sendIssueSessionKey(
  client: AuraClient,
  payer: Signer,
  input: IssueSessionKeyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await issueSessionKey(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `migrate_treasury` instruction. */
export type MigrateTreasuryInput = {
  accounts: MethodAccounts<"migrateTreasury">;
  args?: undefined;
};

/** Builds a `migrate_treasury` instruction. */
export function migrateTreasury(
  client: AuraClient,
  input: MigrateTreasuryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .migrateTreasury()
    .accountsStrict(input.accounts)
    .instruction();
}

export const migrateTreasuryInstruction = migrateTreasury;

/** Builds and sends a `migrate_treasury` transaction. */
export async function sendMigrateTreasury(
  client: AuraClient,
  payer: Signer,
  input: MigrateTreasuryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await migrateTreasury(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `nominate_successor_owner` instruction. */
export type NominateSuccessorOwnerInput = {
  accounts: MethodAccounts<"nominateSuccessorOwner">;
  args: MethodArgs<"nominateSuccessorOwner">[0];
};

/** Builds a `nominate_successor_owner` instruction. */
export function nominateSuccessorOwner(
  client: AuraClient,
  input: NominateSuccessorOwnerInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .nominateSuccessorOwner(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const nominateSuccessorOwnerInstruction = nominateSuccessorOwner;

/** Builds and sends a `nominate_successor_owner` transaction. */
export async function sendNominateSuccessorOwner(
  client: AuraClient,
  payer: Signer,
  input: NominateSuccessorOwnerInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await nominateSuccessorOwner(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `register_agent` instruction. */
export type RegisterAgentInput = {
  accounts: MethodAccounts<"registerAgent">;
  args: MethodArgs<"registerAgent">[0];
};

/** Builds a `register_agent` instruction. */
export function registerAgent(
  client: AuraClient,
  input: RegisterAgentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .registerAgent(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const registerAgentInstruction = registerAgent;

/** Builds and sends a `register_agent` transaction. */
export async function sendRegisterAgent(
  client: AuraClient,
  payer: Signer,
  input: RegisterAgentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await registerAgent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `register_chain_profile` instruction. */
export type RegisterChainProfileInput = {
  accounts: MethodAccounts<"registerChainProfile">;
  args: MethodArgs<"registerChainProfile">[0];
};

/** Builds a `register_chain_profile` instruction. */
export function registerChainProfile(
  client: AuraClient,
  input: RegisterChainProfileInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .registerChainProfile(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const registerChainProfileInstruction = registerChainProfile;

/** Builds and sends a `register_chain_profile` transaction. */
export async function sendRegisterChainProfile(
  client: AuraClient,
  payer: Signer,
  input: RegisterChainProfileInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await registerChainProfile(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `revoke_agent` instruction. */
export type RevokeAgentInput = {
  accounts: MethodAccounts<"revokeAgent">;
  args: {
    key: MethodArgs<"revokeAgent">[0];
    now: MethodArgs<"revokeAgent">[1];
  };
};

/** Builds a `revoke_agent` instruction. */
export function revokeAgent(
  client: AuraClient,
  input: RevokeAgentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .revokeAgent(input.args.key, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const revokeAgentInstruction = revokeAgent;

/** Builds and sends a `revoke_agent` transaction. */
export async function sendRevokeAgent(
  client: AuraClient,
  payer: Signer,
  input: RevokeAgentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await revokeAgent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `revoke_operator_role` instruction. */
export type RevokeOperatorRoleInput = {
  accounts: MethodAccounts<"revokeOperatorRole">;
  args: {
    now: MethodArgs<"revokeOperatorRole">[0];
  };
};

/** Builds a `revoke_operator_role` instruction. */
export function revokeOperatorRole(
  client: AuraClient,
  input: RevokeOperatorRoleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .revokeOperatorRole(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const revokeOperatorRoleInstruction = revokeOperatorRole;

/** Builds and sends a `revoke_operator_role` transaction. */
export async function sendRevokeOperatorRole(
  client: AuraClient,
  payer: Signer,
  input: RevokeOperatorRoleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await revokeOperatorRole(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `revoke_session_key` instruction. */
export type RevokeSessionKeyInput = {
  accounts: MethodAccounts<"revokeSessionKey">;
  args: {
    now: MethodArgs<"revokeSessionKey">[0];
  };
};

/** Builds a `revoke_session_key` instruction. */
export function revokeSessionKey(
  client: AuraClient,
  input: RevokeSessionKeyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .revokeSessionKey(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const revokeSessionKeyInstruction = revokeSessionKey;

/** Builds and sends a `revoke_session_key` transaction. */
export async function sendRevokeSessionKey(
  client: AuraClient,
  payer: Signer,
  input: RevokeSessionKeyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await revokeSessionKey(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_agent_capability` instruction. */
export type SetAgentCapabilityInput = {
  accounts: MethodAccounts<"setAgentCapability">;
  args: MethodArgs<"setAgentCapability">[0];
};

/** Builds a `set_agent_capability` instruction. */
export function setAgentCapability(
  client: AuraClient,
  input: SetAgentCapabilityInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setAgentCapability(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setAgentCapabilityInstruction = setAgentCapability;

/** Builds and sends a `set_agent_capability` transaction. */
export async function sendSetAgentCapability(
  client: AuraClient,
  payer: Signer,
  input: SetAgentCapabilityInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setAgentCapability(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_agent_tripwires` instruction. */
export type SetAgentTripwiresInput = {
  accounts: MethodAccounts<"setAgentTripwires">;
  args: MethodArgs<"setAgentTripwires">[0];
};

/** Builds a `set_agent_tripwires` instruction. */
export function setAgentTripwires(
  client: AuraClient,
  input: SetAgentTripwiresInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setAgentTripwires(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setAgentTripwiresInstruction = setAgentTripwires;

/** Builds and sends a `set_agent_tripwires` transaction. */
export async function sendSetAgentTripwires(
  client: AuraClient,
  payer: Signer,
  input: SetAgentTripwiresInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setAgentTripwires(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `transition_agent_state` instruction. */
export type TransitionAgentStateInput = {
  accounts: MethodAccounts<"transitionAgentState">;
  args: {
    targetState: MethodArgs<"transitionAgentState">[0];
    now: MethodArgs<"transitionAgentState">[1];
  };
};

/** Builds a `transition_agent_state` instruction. */
export function transitionAgentState(
  client: AuraClient,
  input: TransitionAgentStateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .transitionAgentState(input.args.targetState, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const transitionAgentStateInstruction = transitionAgentState;

/** Builds and sends a `transition_agent_state` transaction. */
export async function sendTransitionAgentState(
  client: AuraClient,
  payer: Signer,
  input: TransitionAgentStateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await transitionAgentState(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `trigger_dead_mans_switch` instruction. */
export type TriggerDeadMansSwitchInput = {
  accounts: MethodAccounts<"triggerDeadMansSwitch">;
  args: {
    now: MethodArgs<"triggerDeadMansSwitch">[0];
  };
};

/** Builds a `trigger_dead_mans_switch` instruction. */
export function triggerDeadMansSwitch(
  client: AuraClient,
  input: TriggerDeadMansSwitchInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .triggerDeadMansSwitch(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const triggerDeadMansSwitchInstruction = triggerDeadMansSwitch;

/** Builds and sends a `trigger_dead_mans_switch` transaction. */
export async function sendTriggerDeadMansSwitch(
  client: AuraClient,
  payer: Signer,
  input: TriggerDeadMansSwitchInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await triggerDeadMansSwitch(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_chain_profile` instruction. */
export type UpdateChainProfileInput = {
  accounts: MethodAccounts<"updateChainProfile">;
  args: MethodArgs<"updateChainProfile">[0];
};

/** Builds a `update_chain_profile` instruction. */
export function updateChainProfile(
  client: AuraClient,
  input: UpdateChainProfileInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateChainProfile(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateChainProfileInstruction = updateChainProfile;

/** Builds and sends a `update_chain_profile` transaction. */
export async function sendUpdateChainProfile(
  client: AuraClient,
  payer: Signer,
  input: UpdateChainProfileInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateChainProfile(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_operator_role` instruction. */
export type UpdateOperatorRoleInput = {
  accounts: MethodAccounts<"updateOperatorRole">;
  args: MethodArgs<"updateOperatorRole">[0];
};

/** Builds a `update_operator_role` instruction. */
export function updateOperatorRole(
  client: AuraClient,
  input: UpdateOperatorRoleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateOperatorRole(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateOperatorRoleInstruction = updateOperatorRole;

/** Builds and sends a `update_operator_role` transaction. */
export async function sendUpdateOperatorRole(
  client: AuraClient,
  payer: Signer,
  input: UpdateOperatorRoleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateOperatorRole(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_protocol_config` instruction. */
export type UpdateProtocolConfigInput = {
  accounts: MethodAccounts<"updateProtocolConfig">;
  args: {
    args: MethodArgs<"updateProtocolConfig">[0];
    now: MethodArgs<"updateProtocolConfig">[1];
  };
};

/** Builds a `update_protocol_config` instruction. */
export function updateProtocolConfig(
  client: AuraClient,
  input: UpdateProtocolConfigInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateProtocolConfig(input.args.args, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateProtocolConfigInstruction = updateProtocolConfig;

/** Builds and sends a `update_protocol_config` transaction. */
export async function sendUpdateProtocolConfig(
  client: AuraClient,
  payer: Signer,
  input: UpdateProtocolConfigInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateProtocolConfig(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_session_key` instruction. */
export type UpdateSessionKeyInput = {
  accounts: MethodAccounts<"updateSessionKey">;
  args: MethodArgs<"updateSessionKey">[0];
};

/** Builds a `update_session_key` instruction. */
export function updateSessionKey(
  client: AuraClient,
  input: UpdateSessionKeyInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateSessionKey(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateSessionKeyInstruction = updateSessionKey;

/** Builds and sends a `update_session_key` transaction. */
export async function sendUpdateSessionKey(
  client: AuraClient,
  payer: Signer,
  input: UpdateSessionKeyInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateSessionKey(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
