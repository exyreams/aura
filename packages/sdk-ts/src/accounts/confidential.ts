/** Generated account fetchers for the confidential domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type ConfidentialGuardrailsAccount =
  AuraAccounts["confidentialGuardrailsAccount"];

/** Fetches the `ConfidentialGuardrailsAccount` account state from the cluster. */
export async function fetchConfidentialGuardrailsAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ConfidentialGuardrailsAccount> {
  return (await client.program.account.confidentialGuardrailsAccount.fetch(
    address,
  )) as ConfidentialGuardrailsAccount;
}

/** Fetches the `ConfidentialGuardrailsAccount` account state, or returns null if not found. */
export async function fetchConfidentialGuardrailsAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ConfidentialGuardrailsAccount | null> {
  return (await client.program.account.confidentialGuardrailsAccount.fetchNullable(
    address,
  )) as ConfidentialGuardrailsAccount | null;
}
