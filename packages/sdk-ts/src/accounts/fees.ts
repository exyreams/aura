/** Generated account fetchers for the fees domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type FeeScheduleAccount = AuraAccounts["feeScheduleAccount"];

/** Fetches the `FeeScheduleAccount` account state from the cluster. */
export async function fetchFeeScheduleAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<FeeScheduleAccount> {
  return (await client.program.account.feeScheduleAccount.fetch(
    address,
  )) as FeeScheduleAccount;
}

/** Fetches the `FeeScheduleAccount` account state, or returns null if not found. */
export async function fetchFeeScheduleAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<FeeScheduleAccount | null> {
  return (await client.program.account.feeScheduleAccount.fetchNullable(
    address,
  )) as FeeScheduleAccount | null;
}

export type FeeVaultAccount = AuraAccounts["feeVaultAccount"];

/** Fetches the `FeeVaultAccount` account state from the cluster. */
export async function fetchFeeVaultAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<FeeVaultAccount> {
  return (await client.program.account.feeVaultAccount.fetch(
    address,
  )) as FeeVaultAccount;
}

/** Fetches the `FeeVaultAccount` account state, or returns null if not found. */
export async function fetchFeeVaultAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<FeeVaultAccount | null> {
  return (await client.program.account.feeVaultAccount.fetchNullable(
    address,
  )) as FeeVaultAccount | null;
}
