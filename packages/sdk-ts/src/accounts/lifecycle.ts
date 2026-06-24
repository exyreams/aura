/** Generated account fetchers for the lifecycle domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type ChainProfileAccount = AuraAccounts["chainProfileAccount"];

/** Fetches the `ChainProfileAccount` account state from the cluster. */
export async function fetchChainProfileAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ChainProfileAccount> {
  return (await client.program.account.chainProfileAccount.fetch(
    address,
  )) as ChainProfileAccount;
}

/** Fetches the `ChainProfileAccount` account state, or returns null if not found. */
export async function fetchChainProfileAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ChainProfileAccount | null> {
  return (await client.program.account.chainProfileAccount.fetchNullable(
    address,
  )) as ChainProfileAccount | null;
}

export type ProtocolConfigAccount = AuraAccounts["protocolConfigAccount"];

/** Fetches the `ProtocolConfigAccount` account state from the cluster. */
export async function fetchProtocolConfigAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ProtocolConfigAccount> {
  return (await client.program.account.protocolConfigAccount.fetch(
    address,
  )) as ProtocolConfigAccount;
}

/** Fetches the `ProtocolConfigAccount` account state, or returns null if not found. */
export async function fetchProtocolConfigAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ProtocolConfigAccount | null> {
  return (await client.program.account.protocolConfigAccount.fetchNullable(
    address,
  )) as ProtocolConfigAccount | null;
}

export type SessionKeyAccount = AuraAccounts["sessionKeyAccount"];

/** Fetches the `SessionKeyAccount` account state from the cluster. */
export async function fetchSessionKeyAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<SessionKeyAccount> {
  return (await client.program.account.sessionKeyAccount.fetch(
    address,
  )) as SessionKeyAccount;
}

/** Fetches the `SessionKeyAccount` account state, or returns null if not found. */
export async function fetchSessionKeyAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<SessionKeyAccount | null> {
  return (await client.program.account.sessionKeyAccount.fetchNullable(
    address,
  )) as SessionKeyAccount | null;
}
