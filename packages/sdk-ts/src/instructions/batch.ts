/** Generated instruction builders for the batch domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `propose_batch` instruction. */
export type ProposeBatchInput = {
  accounts: MethodAccounts<"proposeBatch">;
  args: MethodArgs<"proposeBatch">[0];
};

/** Builds a `propose_batch` instruction. */
export function proposeBatch(
  client: AuraClient,
  input: ProposeBatchInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeBatch(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeBatchInstruction = proposeBatch;

/** Builds and sends a `propose_batch` transaction. */
export async function sendProposeBatch(
  client: AuraClient,
  payer: Signer,
  input: ProposeBatchInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeBatch(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `propose_confidential_batch` instruction. */
export type ProposeConfidentialBatchInput = {
  accounts: MethodAccounts<"proposeConfidentialBatch">;
  args: MethodArgs<"proposeConfidentialBatch">[0];
};

/** Builds a `propose_confidential_batch` instruction. */
export function proposeConfidentialBatch(
  client: AuraClient,
  input: ProposeConfidentialBatchInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .proposeConfidentialBatch(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const proposeConfidentialBatchInstruction = proposeConfidentialBatch;

/** Builds and sends a `propose_confidential_batch` transaction. */
export async function sendProposeConfidentialBatch(
  client: AuraClient,
  payer: Signer,
  input: ProposeConfidentialBatchInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await proposeConfidentialBatch(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
