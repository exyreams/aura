/** Generated account fetchers for the governance domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type OperatorRoleAccount = AuraAccounts["operatorRoleAccount"];

/** Fetches the `OperatorRoleAccount` account state from the cluster. */
export async function fetchOperatorRoleAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<OperatorRoleAccount> {
  return (await client.program.account.operatorRoleAccount.fetch(
    address,
  )) as OperatorRoleAccount;
}

/** Fetches the `OperatorRoleAccount` account state, or returns null if not found. */
export async function fetchOperatorRoleAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<OperatorRoleAccount | null> {
  return (await client.program.account.operatorRoleAccount.fetchNullable(
    address,
  )) as OperatorRoleAccount | null;
}
