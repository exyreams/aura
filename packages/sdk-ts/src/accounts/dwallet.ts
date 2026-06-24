/** Generated account fetchers for the dwallet domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type DWalletAccount = AuraAccounts["dWalletAccount"];

/** Fetches the `DWalletAccount` account state from the cluster. */
export async function fetchDWalletAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<DWalletAccount> {
  return (await client.program.account.dWalletAccount.fetch(
    address,
  )) as DWalletAccount;
}

/** Fetches the `DWalletAccount` account state, or returns null if not found. */
export async function fetchDWalletAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<DWalletAccount | null> {
  return (await client.program.account.dWalletAccount.fetchNullable(
    address,
  )) as DWalletAccount | null;
}
