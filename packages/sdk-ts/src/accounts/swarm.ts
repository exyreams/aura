/** Generated account fetchers for the swarm domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type SwarmPoolAccount = AuraAccounts["swarmPoolAccount"];

/** Fetches the `SwarmPoolAccount` account state from the cluster. */
export async function fetchSwarmPoolAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<SwarmPoolAccount> {
  return (await client.program.account.swarmPoolAccount.fetch(
    address,
  )) as SwarmPoolAccount;
}

/** Fetches the `SwarmPoolAccount` account state, or returns null if not found. */
export async function fetchSwarmPoolAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<SwarmPoolAccount | null> {
  return (await client.program.account.swarmPoolAccount.fetchNullable(
    address,
  )) as SwarmPoolAccount | null;
}
