/** Generated instruction builders for the execution domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `abandon_proposal` instruction. */
export type AbandonProposalInput = {
  accounts: MethodAccounts<"abandonProposal">;
  args: {
    proposalId: MethodArgs<"abandonProposal">[0];
    now: MethodArgs<"abandonProposal">[1];
  };
};

/** Builds a `abandon_proposal` instruction. */
export function abandonProposal(
  client: AuraClient,
  input: AbandonProposalInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .abandonProposal(input.args.proposalId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const abandonProposalInstruction = abandonProposal;

/** Builds and sends a `abandon_proposal` transaction. */
export async function sendAbandonProposal(
  client: AuraClient,
  payer: Signer,
  input: AbandonProposalInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await abandonProposal(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `approve_pending_execution` instruction. */
export type ApprovePendingExecutionInput = {
  accounts: MethodAccounts<"approvePendingExecution">;
  args: MethodArgs<"approvePendingExecution">[0];
};

/** Builds a `approve_pending_execution` instruction. */
export function approvePendingExecution(
  client: AuraClient,
  input: ApprovePendingExecutionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .approvePendingExecution(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const approvePendingExecutionInstruction = approvePendingExecution;

/** Builds and sends a `approve_pending_execution` transaction. */
export async function sendApprovePendingExecution(
  client: AuraClient,
  payer: Signer,
  input: ApprovePendingExecutionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await approvePendingExecution(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `cancel_pending` instruction. */
export type CancelPendingInput = {
  accounts: MethodAccounts<"cancelPending">;
  args: {
    now: MethodArgs<"cancelPending">[0];
  };
};

/** Builds a `cancel_pending` instruction. */
export function cancelPending(
  client: AuraClient,
  input: CancelPendingInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .cancelPending(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const cancelPendingInstruction = cancelPending;

/** Builds and sends a `cancel_pending` transaction. */
export async function sendCancelPending(
  client: AuraClient,
  payer: Signer,
  input: CancelPendingInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await cancelPending(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `clear_scheduled_intent_in_flight` instruction. */
export type ClearScheduledIntentInFlightInput = {
  accounts: MethodAccounts<"clearScheduledIntentInFlight">;
  args: {
    proposalId: MethodArgs<"clearScheduledIntentInFlight">[0];
    now: MethodArgs<"clearScheduledIntentInFlight">[1];
  };
};

/** Builds a `clear_scheduled_intent_in_flight` instruction. */
export function clearScheduledIntentInFlight(
  client: AuraClient,
  input: ClearScheduledIntentInFlightInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .clearScheduledIntentInFlight(input.args.proposalId, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const clearScheduledIntentInFlightInstruction =
  clearScheduledIntentInFlight;

/** Builds and sends a `clear_scheduled_intent_in_flight` transaction. */
export async function sendClearScheduledIntentInFlight(
  client: AuraClient,
  payer: Signer,
  input: ClearScheduledIntentInFlightInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await clearScheduledIntentInFlight(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_conditional_proposal` instruction. */
export type CloseConditionalProposalInput = {
  accounts: MethodAccounts<"closeConditionalProposal">;
  args?: undefined;
};

/** Builds a `close_conditional_proposal` instruction. */
export function closeConditionalProposal(
  client: AuraClient,
  input: CloseConditionalProposalInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeConditionalProposal()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeConditionalProposalInstruction = closeConditionalProposal;

/** Builds and sends a `close_conditional_proposal` transaction. */
export async function sendCloseConditionalProposal(
  client: AuraClient,
  payer: Signer,
  input: CloseConditionalProposalInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeConditionalProposal(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_scheduled_intent` instruction. */
export type CloseScheduledIntentInput = {
  accounts: MethodAccounts<"closeScheduledIntent">;
  args?: undefined;
};

/** Builds a `close_scheduled_intent` instruction. */
export function closeScheduledIntent(
  client: AuraClient,
  input: CloseScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeScheduledIntent()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeScheduledIntentInstruction = closeScheduledIntent;

/** Builds and sends a `close_scheduled_intent` transaction. */
export async function sendCloseScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: CloseScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `confirm_settlement` instruction. */
export type ConfirmSettlementInput = {
  accounts: MethodAccounts<"confirmSettlement">;
  args: MethodArgs<"confirmSettlement">[0];
};

/** Builds a `confirm_settlement` instruction. */
export function confirmSettlement(
  client: AuraClient,
  input: ConfirmSettlementInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .confirmSettlement(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const confirmSettlementInstruction = confirmSettlement;

/** Builds and sends a `confirm_settlement` transaction. */
export async function sendConfirmSettlement(
  client: AuraClient,
  payer: Signer,
  input: ConfirmSettlementInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await confirmSettlement(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `create_scheduled_intent` instruction. */
export type CreateScheduledIntentInput = {
  accounts: MethodAccounts<"createScheduledIntent">;
  args: {
    intentId: MethodArgs<"createScheduledIntent">[0];
    args: MethodArgs<"createScheduledIntent">[1];
  };
};

/** Builds a `create_scheduled_intent` instruction. */
export function createScheduledIntent(
  client: AuraClient,
  input: CreateScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .createScheduledIntent(input.args.intentId, input.args.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const createScheduledIntentInstruction = createScheduledIntent;

/** Builds and sends a `create_scheduled_intent` transaction. */
export async function sendCreateScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: CreateScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await createScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_pending` instruction. */
export type ExecutePendingInput = {
  accounts: MethodAccounts<"executePending">;
  args: {
    now: MethodArgs<"executePending">[0];
  };
};

/** Builds a `execute_pending` instruction. */
export function executePending(
  client: AuraClient,
  input: ExecutePendingInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executePending(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const executePendingInstruction = executePending;

/** Builds and sends a `execute_pending` transaction. */
export async function sendExecutePending(
  client: AuraClient,
  payer: Signer,
  input: ExecutePendingInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executePending(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `execute_scheduled_intent` instruction. */
export type ExecuteScheduledIntentInput = {
  accounts: MethodAccounts<"executeScheduledIntent">;
  args?: undefined;
};

/** Builds a `execute_scheduled_intent` instruction. */
export function executeScheduledIntent(
  client: AuraClient,
  input: ExecuteScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .executeScheduledIntent()
    .accountsStrict(input.accounts)
    .instruction();
}

export const executeScheduledIntentInstruction = executeScheduledIntent;

/** Builds and sends a `execute_scheduled_intent` transaction. */
export async function sendExecuteScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: ExecuteScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await executeScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `finalize_execution` instruction. */
export type FinalizeExecutionInput = {
  accounts: MethodAccounts<"finalizeExecution">;
  args: {
    now: MethodArgs<"finalizeExecution">[0];
  };
};

/** Builds a `finalize_execution` instruction. */
export function finalizeExecution(
  client: AuraClient,
  input: FinalizeExecutionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .finalizeExecution(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const finalizeExecutionInstruction = finalizeExecution;

/** Builds and sends a `finalize_execution` transaction. */
export async function sendFinalizeExecution(
  client: AuraClient,
  payer: Signer,
  input: FinalizeExecutionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await finalizeExecution(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `mark_settlement_broadcast` instruction. */
export type MarkSettlementBroadcastInput = {
  accounts: MethodAccounts<"markSettlementBroadcast">;
  args: MethodArgs<"markSettlementBroadcast">[0];
};

/** Builds a `mark_settlement_broadcast` instruction. */
export function markSettlementBroadcast(
  client: AuraClient,
  input: MarkSettlementBroadcastInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .markSettlementBroadcast(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const markSettlementBroadcastInstruction = markSettlementBroadcast;

/** Builds and sends a `mark_settlement_broadcast` transaction. */
export async function sendMarkSettlementBroadcast(
  client: AuraClient,
  payer: Signer,
  input: MarkSettlementBroadcastInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await markSettlementBroadcast(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `pause_execution` instruction. */
export type PauseExecutionInput = {
  accounts: MethodAccounts<"pauseExecution">;
  args: {
    paused: MethodArgs<"pauseExecution">[0];
    now: MethodArgs<"pauseExecution">[1];
  };
};

/** Builds a `pause_execution` instruction. */
export function pauseExecution(
  client: AuraClient,
  input: PauseExecutionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .pauseExecution(input.args.paused, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const pauseExecutionInstruction = pauseExecution;

/** Builds and sends a `pause_execution` transaction. */
export async function sendPauseExecution(
  client: AuraClient,
  payer: Signer,
  input: PauseExecutionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await pauseExecution(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `pause_scheduled_intent` instruction. */
export type PauseScheduledIntentInput = {
  accounts: MethodAccounts<"pauseScheduledIntent">;
  args?: undefined;
};

/** Builds a `pause_scheduled_intent` instruction. */
export function pauseScheduledIntent(
  client: AuraClient,
  input: PauseScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .pauseScheduledIntent()
    .accountsStrict(input.accounts)
    .instruction();
}

export const pauseScheduledIntentInstruction = pauseScheduledIntent;

/** Builds and sends a `pause_scheduled_intent` transaction. */
export async function sendPauseScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: PauseScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await pauseScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_conditional_transaction` instruction. */
export type ProposeConditionalTransactionInput = {
  accounts: MethodAccounts<"proposeConditionalTransaction">;
  args: {
    proposalId: MethodArgs<"proposeConditionalTransaction">[0];
    args: MethodArgs<"proposeConditionalTransaction">[1];
  };
};

/** Builds a `propose_conditional_transaction` instruction. */
export function proposeConditionalTransaction(
  client: AuraClient,
  input: ProposeConditionalTransactionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeConditionalTransaction(input.args.proposalId, input.args.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeConditionalTransactionInstruction =
  proposeConditionalTransaction;

/** Builds and sends a `propose_conditional_transaction` transaction. */
export async function sendProposeConditionalTransaction(
  client: AuraClient,
  payer: Signer,
  input: ProposeConditionalTransactionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeConditionalTransaction(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_transaction` instruction. */
export type ProposeTransactionInput = {
  accounts: MethodAccounts<"proposeTransaction">;
  args: MethodArgs<"proposeTransaction">[0];
};

/** Builds a `propose_transaction` instruction. */
export function proposeTransaction(
  client: AuraClient,
  input: ProposeTransactionInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeTransaction(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeTransactionInstruction = proposeTransaction;

/** Builds and sends a `propose_transaction` transaction. */
export async function sendProposeTransaction(
  client: AuraClient,
  payer: Signer,
  input: ProposeTransactionInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeTransaction(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `resubmit_proposal` instruction. */
export type ResubmitProposalInput = {
  accounts: MethodAccounts<"resubmitProposal">;
  args: MethodArgs<"resubmitProposal">[0];
};

/** Builds a `resubmit_proposal` instruction. */
export function resubmitProposal(
  client: AuraClient,
  input: ResubmitProposalInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .resubmitProposal(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const resubmitProposalInstruction = resubmitProposal;

/** Builds and sends a `resubmit_proposal` transaction. */
export async function sendResubmitProposal(
  client: AuraClient,
  payer: Signer,
  input: ResubmitProposalInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await resubmitProposal(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `resume_scheduled_intent` instruction. */
export type ResumeScheduledIntentInput = {
  accounts: MethodAccounts<"resumeScheduledIntent">;
  args?: undefined;
};

/** Builds a `resume_scheduled_intent` instruction. */
export function resumeScheduledIntent(
  client: AuraClient,
  input: ResumeScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .resumeScheduledIntent()
    .accountsStrict(input.accounts)
    .instruction();
}

export const resumeScheduledIntentInstruction = resumeScheduledIntent;

/** Builds and sends a `resume_scheduled_intent` transaction. */
export async function sendResumeScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: ResumeScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await resumeScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `try_trigger` instruction. */
export type TryTriggerInput = {
  accounts: MethodAccounts<"tryTrigger">;
  args?: undefined;
};

/** Builds a `try_trigger` instruction. */
export function tryTrigger(
  client: AuraClient,
  input: TryTriggerInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .tryTrigger()
    .accountsStrict(input.accounts)
    .instruction();
}

export const tryTriggerInstruction = tryTrigger;

/** Builds and sends a `try_trigger` transaction. */
export async function sendTryTrigger(
  client: AuraClient,
  payer: Signer,
  input: TryTriggerInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await tryTrigger(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_scheduled_intent` instruction. */
export type UpdateScheduledIntentInput = {
  accounts: MethodAccounts<"updateScheduledIntent">;
  args: MethodArgs<"updateScheduledIntent">[0];
};

/** Builds a `update_scheduled_intent` instruction. */
export function updateScheduledIntent(
  client: AuraClient,
  input: UpdateScheduledIntentInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateScheduledIntent(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateScheduledIntentInstruction = updateScheduledIntent;

/** Builds and sends a `update_scheduled_intent` transaction. */
export async function sendUpdateScheduledIntent(
  client: AuraClient,
  payer: Signer,
  input: UpdateScheduledIntentInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateScheduledIntent(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
