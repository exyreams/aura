/** Generated instruction builders for the budget domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `close_exposure_group` instruction. */
export type CloseExposureGroupInput = {
  accounts: MethodAccounts<"closeExposureGroup">;
  args?: undefined;
};

/** Builds a `close_exposure_group` instruction. */
export function closeExposureGroup(
  client: AuraClient,
  input: CloseExposureGroupInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeExposureGroup()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeExposureGroupInstruction = closeExposureGroup;

/** Builds and sends a `close_exposure_group` transaction. */
export async function sendCloseExposureGroup(
  client: AuraClient,
  payer: Signer,
  input: CloseExposureGroupInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeExposureGroup(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_approval_ladder` instruction. */
export type ConfigureApprovalLadderInput = {
  accounts: MethodAccounts<"configureApprovalLadder">;
  args: MethodArgs<"configureApprovalLadder">[0];
};

/** Builds a `configure_approval_ladder` instruction. */
export function configureApprovalLadder(
  client: AuraClient,
  input: ConfigureApprovalLadderInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureApprovalLadder(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureApprovalLadderInstruction = configureApprovalLadder;

/** Builds and sends a `configure_approval_ladder` transaction. */
export async function sendConfigureApprovalLadder(
  client: AuraClient,
  payer: Signer,
  input: ConfigureApprovalLadderInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureApprovalLadder(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_budget_envelope` instruction. */
export type ConfigureBudgetEnvelopeInput = {
  accounts: MethodAccounts<"configureBudgetEnvelope">;
  args: MethodArgs<"configureBudgetEnvelope">[0];
};

/** Builds a `configure_budget_envelope` instruction. */
export function configureBudgetEnvelope(
  client: AuraClient,
  input: ConfigureBudgetEnvelopeInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureBudgetEnvelope(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureBudgetEnvelopeInstruction = configureBudgetEnvelope;

/** Builds and sends a `configure_budget_envelope` transaction. */
export async function sendConfigureBudgetEnvelope(
  client: AuraClient,
  payer: Signer,
  input: ConfigureBudgetEnvelopeInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureBudgetEnvelope(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_liveness_guardrails` instruction. */
export type ConfigureLivenessGuardrailsInput = {
  accounts: MethodAccounts<"configureLivenessGuardrails">;
  args: MethodArgs<"configureLivenessGuardrails">[0];
};

/** Builds a `configure_liveness_guardrails` instruction. */
export function configureLivenessGuardrails(
  client: AuraClient,
  input: ConfigureLivenessGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureLivenessGuardrails(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureLivenessGuardrailsInstruction =
  configureLivenessGuardrails;

/** Builds and sends a `configure_liveness_guardrails` transaction. */
export async function sendConfigureLivenessGuardrails(
  client: AuraClient,
  payer: Signer,
  input: ConfigureLivenessGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureLivenessGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_exposure_group` instruction. */
export type InitExposureGroupInput = {
  accounts: MethodAccounts<"initExposureGroup">;
  args: MethodArgs<"initExposureGroup">[0];
};

/** Builds a `init_exposure_group` instruction. */
export function initExposureGroup(
  client: AuraClient,
  input: InitExposureGroupInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initExposureGroup(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initExposureGroupInstruction = initExposureGroup;

/** Builds and sends a `init_exposure_group` transaction. */
export async function sendInitExposureGroup(
  client: AuraClient,
  payer: Signer,
  input: InitExposureGroupInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initExposureGroup(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `join_exposure_group` instruction. */
export type JoinExposureGroupInput = {
  accounts: MethodAccounts<"joinExposureGroup">;
  args?: undefined;
};

/** Builds a `join_exposure_group` instruction. */
export function joinExposureGroup(
  client: AuraClient,
  input: JoinExposureGroupInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .joinExposureGroup()
    .accountsStrict(input.accounts)
    .instruction();
}

export const joinExposureGroupInstruction = joinExposureGroup;

/** Builds and sends a `join_exposure_group` transaction. */
export async function sendJoinExposureGroup(
  client: AuraClient,
  payer: Signer,
  input: JoinExposureGroupInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await joinExposureGroup(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `leave_exposure_group` instruction. */
export type LeaveExposureGroupInput = {
  accounts: MethodAccounts<"leaveExposureGroup">;
  args?: undefined;
};

/** Builds a `leave_exposure_group` instruction. */
export function leaveExposureGroup(
  client: AuraClient,
  input: LeaveExposureGroupInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .leaveExposureGroup()
    .accountsStrict(input.accounts)
    .instruction();
}

export const leaveExposureGroupInstruction = leaveExposureGroup;

/** Builds and sends a `leave_exposure_group` transaction. */
export async function sendLeaveExposureGroup(
  client: AuraClient,
  payer: Signer,
  input: LeaveExposureGroupInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await leaveExposureGroup(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `remove_budget_envelope` instruction. */
export type RemoveBudgetEnvelopeInput = {
  accounts: MethodAccounts<"removeBudgetEnvelope">;
  args: {
    envelopeId: MethodArgs<"removeBudgetEnvelope">[0];
    now: MethodArgs<"removeBudgetEnvelope">[1];
  };
};

/** Builds a `remove_budget_envelope` instruction. */
export function removeBudgetEnvelope(
  client: AuraClient,
  input: RemoveBudgetEnvelopeInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .removeBudgetEnvelope(input.args.envelopeId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const removeBudgetEnvelopeInstruction = removeBudgetEnvelope;

/** Builds and sends a `remove_budget_envelope` transaction. */
export async function sendRemoveBudgetEnvelope(
  client: AuraClient,
  payer: Signer,
  input: RemoveBudgetEnvelopeInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await removeBudgetEnvelope(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_exposure_group` instruction. */
export type UpdateExposureGroupInput = {
  accounts: MethodAccounts<"updateExposureGroup">;
  args: {
    dailyLimitUsd: MethodArgs<"updateExposureGroup">[0];
  };
};

/** Builds a `update_exposure_group` instruction. */
export function updateExposureGroup(
  client: AuraClient,
  input: UpdateExposureGroupInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateExposureGroup(input.args.dailyLimitUsd)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateExposureGroupInstruction = updateExposureGroup;

/** Builds and sends a `update_exposure_group` transaction. */
export async function sendUpdateExposureGroup(
  client: AuraClient,
  payer: Signer,
  input: UpdateExposureGroupInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateExposureGroup(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
