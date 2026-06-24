/** Generated account fetchers for the execution domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type BatchProposalAccount = AuraAccounts["batchProposalAccount"];

/** Fetches the `BatchProposalAccount` account state from the cluster. */
export async function fetchBatchProposalAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<BatchProposalAccount> {
  return (await client.program.account.batchProposalAccount.fetch(
    address,
  )) as BatchProposalAccount;
}

/** Fetches the `BatchProposalAccount` account state, or returns null if not found. */
export async function fetchBatchProposalAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<BatchProposalAccount | null> {
  return (await client.program.account.batchProposalAccount.fetchNullable(
    address,
  )) as BatchProposalAccount | null;
}

export type ConditionalProposal = AuraAccounts["conditionalProposal"];

/** Fetches the `ConditionalProposal` account state from the cluster. */
export async function fetchConditionalProposal(
  client: AuraClient,
  address: PublicKey,
): Promise<ConditionalProposal> {
  return (await client.program.account.conditionalProposal.fetch(
    address,
  )) as ConditionalProposal;
}

/** Fetches the `ConditionalProposal` account state, or returns null if not found. */
export async function fetchConditionalProposalNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ConditionalProposal | null> {
  return (await client.program.account.conditionalProposal.fetchNullable(
    address,
  )) as ConditionalProposal | null;
}

export type ScheduledIntent = AuraAccounts["scheduledIntent"];

/** Fetches the `ScheduledIntent` account state from the cluster. */
export async function fetchScheduledIntent(
  client: AuraClient,
  address: PublicKey,
): Promise<ScheduledIntent> {
  return (await client.program.account.scheduledIntent.fetch(
    address,
  )) as ScheduledIntent;
}

/** Fetches the `ScheduledIntent` account state, or returns null if not found. */
export async function fetchScheduledIntentNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ScheduledIntent | null> {
  return (await client.program.account.scheduledIntent.fetchNullable(
    address,
  )) as ScheduledIntent | null;
}
