/** Generated account fetchers for the budget domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type BudgetEnvelopeAccount = AuraAccounts["budgetEnvelopeAccount"];

/** Fetches the `BudgetEnvelopeAccount` account state from the cluster. */
export async function fetchBudgetEnvelopeAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<BudgetEnvelopeAccount> {
  return (await client.program.account.budgetEnvelopeAccount.fetch(
    address,
  )) as BudgetEnvelopeAccount;
}

/** Fetches the `BudgetEnvelopeAccount` account state, or returns null if not found. */
export async function fetchBudgetEnvelopeAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<BudgetEnvelopeAccount | null> {
  return (await client.program.account.budgetEnvelopeAccount.fetchNullable(
    address,
  )) as BudgetEnvelopeAccount | null;
}

export type ExposureGroupAccount = AuraAccounts["exposureGroupAccount"];

/** Fetches the `ExposureGroupAccount` account state from the cluster. */
export async function fetchExposureGroupAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ExposureGroupAccount> {
  return (await client.program.account.exposureGroupAccount.fetch(
    address,
  )) as ExposureGroupAccount;
}

/** Fetches the `ExposureGroupAccount` account state, or returns null if not found. */
export async function fetchExposureGroupAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ExposureGroupAccount | null> {
  return (await client.program.account.exposureGroupAccount.fetchNullable(
    address,
  )) as ExposureGroupAccount | null;
}
