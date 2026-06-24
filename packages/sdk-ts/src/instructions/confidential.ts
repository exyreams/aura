/** Generated instruction builders for the confidential domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `close_confidential_guardrails` instruction. */
export type CloseConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"closeConfidentialGuardrails">;
  args?: undefined;
};

/** Builds a `close_confidential_guardrails` instruction. */
export function closeConfidentialGuardrails(
  client: AuraClient,
  input: CloseConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeConfidentialGuardrails()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeConfidentialGuardrailsInstruction =
  closeConfidentialGuardrails;

/** Builds and sends a `close_confidential_guardrails` transaction. */
export async function sendCloseConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: CloseConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_confidential_guardrails` instruction. */
export type ConfigureConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"configureConfidentialGuardrails">;
  args: {
    now: MethodArgs<"configureConfidentialGuardrails">[0];
  };
};

/** Builds a `configure_confidential_guardrails` instruction. */
export function configureConfidentialGuardrails(
  client: AuraClient,
  input: ConfigureConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureConfidentialGuardrails(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureConfidentialGuardrailsInstruction =
  configureConfidentialGuardrails;

/** Builds and sends a `configure_confidential_guardrails` transaction. */
export async function sendConfigureConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: ConfigureConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `confirm_policy_decryption` instruction. */
export type ConfirmPolicyDecryptionInput = {
  accounts: MethodAccounts<"confirmPolicyDecryption">;
  args: {
    now: MethodArgs<"confirmPolicyDecryption">[0];
    currentEpochId: MethodArgs<"confirmPolicyDecryption">[1];
  };
};

/** Builds a `confirm_policy_decryption` instruction. */
export function confirmPolicyDecryption(
  client: AuraClient,
  input: ConfirmPolicyDecryptionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .confirmPolicyDecryption(input.args.now, input.args.currentEpochId)
    .accountsStrict(input.accounts)
    .instruction();
}

export const confirmPolicyDecryptionInstruction = confirmPolicyDecryption;

/** Builds and sends a `confirm_policy_decryption` transaction. */
export async function sendConfirmPolicyDecryption(
  client: AuraClient,
  payer: Signer,
  input: ConfirmPolicyDecryptionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await confirmPolicyDecryption(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `disable_confidential_guardrails` instruction. */
export type DisableConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"disableConfidentialGuardrails">;
  args: {
    now: MethodArgs<"disableConfidentialGuardrails">[0];
  };
};

/** Builds a `disable_confidential_guardrails` instruction. */
export function disableConfidentialGuardrails(
  client: AuraClient,
  input: DisableConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .disableConfidentialGuardrails(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const disableConfidentialGuardrailsInstruction =
  disableConfidentialGuardrails;

/** Builds and sends a `disable_confidential_guardrails` transaction. */
export async function sendDisableConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: DisableConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await disableConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_confidential_guardrails` instruction. */
export type InitConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"initConfidentialGuardrails">;
  args: {
    epochId: MethodArgs<"initConfidentialGuardrails">[0];
    now: MethodArgs<"initConfidentialGuardrails">[1];
  };
};

/** Builds a `init_confidential_guardrails` instruction. */
export function initConfidentialGuardrails(
  client: AuraClient,
  input: InitConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initConfidentialGuardrails(input.args.epochId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initConfidentialGuardrailsInstruction = initConfidentialGuardrails;

/** Builds and sends a `init_confidential_guardrails` transaction. */
export async function sendInitConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: InitConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_confidential_transaction` instruction. */
export type ProposeConfidentialTransactionInput = {
  accounts: MethodAccounts<"proposeConfidentialTransaction">;
  args: MethodArgs<"proposeConfidentialTransaction">[0];
};

/** Builds a `propose_confidential_transaction` instruction. */
export function proposeConfidentialTransaction(
  client: AuraClient,
  input: ProposeConfidentialTransactionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeConfidentialTransaction(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeConfidentialTransactionInstruction =
  proposeConfidentialTransaction;

/** Builds and sends a `propose_confidential_transaction` transaction. */
export async function sendProposeConfidentialTransaction(
  client: AuraClient,
  payer: Signer,
  input: ProposeConfidentialTransactionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeConfidentialTransaction(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `request_policy_decryption` instruction. */
export type RequestPolicyDecryptionInput = {
  accounts: MethodAccounts<"requestPolicyDecryption">;
  args: {
    now: MethodArgs<"requestPolicyDecryption">[0];
    currentEpochId: MethodArgs<"requestPolicyDecryption">[1];
  };
};

/** Builds a `request_policy_decryption` instruction. */
export function requestPolicyDecryption(
  client: AuraClient,
  input: RequestPolicyDecryptionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .requestPolicyDecryption(input.args.now, input.args.currentEpochId)
    .accountsStrict(input.accounts)
    .instruction();
}

export const requestPolicyDecryptionInstruction = requestPolicyDecryption;

/** Builds and sends a `request_policy_decryption` transaction. */
export async function sendRequestPolicyDecryption(
  client: AuraClient,
  payer: Signer,
  input: RequestPolicyDecryptionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await requestPolicyDecryption(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `reset_confidential_counters` instruction. */
export type ResetConfidentialCountersInput = {
  accounts: MethodAccounts<"resetConfidentialCounters">;
  args: {
    now: MethodArgs<"resetConfidentialCounters">[0];
  };
};

/** Builds a `reset_confidential_counters` instruction. */
export function resetConfidentialCounters(
  client: AuraClient,
  input: ResetConfidentialCountersInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .resetConfidentialCounters(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const resetConfidentialCountersInstruction = resetConfidentialCounters;

/** Builds and sends a `reset_confidential_counters` transaction. */
export async function sendResetConfidentialCounters(
  client: AuraClient,
  payer: Signer,
  input: ResetConfidentialCountersInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await resetConfidentialCounters(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `rotate_confidential_guardrails` instruction. */
export type RotateConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"rotateConfidentialGuardrails">;
  args: {
    newEpochId: MethodArgs<"rotateConfidentialGuardrails">[0];
    now: MethodArgs<"rotateConfidentialGuardrails">[1];
  };
};

/** Builds a `rotate_confidential_guardrails` instruction. */
export function rotateConfidentialGuardrails(
  client: AuraClient,
  input: RotateConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .rotateConfidentialGuardrails(input.args.newEpochId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const rotateConfidentialGuardrailsInstruction =
  rotateConfidentialGuardrails;

/** Builds and sends a `rotate_confidential_guardrails` transaction. */
export async function sendRotateConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: RotateConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await rotateConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_confidential_guardrails` instruction. */
export type UpdateConfidentialGuardrailsInput = {
  accounts: MethodAccounts<"updateConfidentialGuardrails">;
  args: {
    now: MethodArgs<"updateConfidentialGuardrails">[0];
  };
};

/** Builds a `update_confidential_guardrails` instruction. */
export function updateConfidentialGuardrails(
  client: AuraClient,
  input: UpdateConfidentialGuardrailsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateConfidentialGuardrails(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateConfidentialGuardrailsInstruction =
  updateConfidentialGuardrails;

/** Builds and sends a `update_confidential_guardrails` transaction. */
export async function sendUpdateConfidentialGuardrails(
  client: AuraClient,
  payer: Signer,
  input: UpdateConfidentialGuardrailsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateConfidentialGuardrails(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
