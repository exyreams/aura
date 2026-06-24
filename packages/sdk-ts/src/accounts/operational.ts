/** Generated account fetchers for the operational domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type ActivityLogAccount = AuraAccounts["activityLogAccount"];

/** Fetches the `ActivityLogAccount` account state from the cluster. */
export async function fetchActivityLogAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ActivityLogAccount> {
  return (await client.program.account.activityLogAccount.fetch(
    address,
  )) as ActivityLogAccount;
}

/** Fetches the `ActivityLogAccount` account state, or returns null if not found. */
export async function fetchActivityLogAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ActivityLogAccount | null> {
  return (await client.program.account.activityLogAccount.fetchNullable(
    address,
  )) as ActivityLogAccount | null;
}

export type ExternalLivenessAccount = AuraAccounts["externalLivenessAccount"];

/** Fetches the `ExternalLivenessAccount` account state from the cluster. */
export async function fetchExternalLivenessAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ExternalLivenessAccount> {
  return (await client.program.account.externalLivenessAccount.fetch(
    address,
  )) as ExternalLivenessAccount;
}

/** Fetches the `ExternalLivenessAccount` account state, or returns null if not found. */
export async function fetchExternalLivenessAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ExternalLivenessAccount | null> {
  return (await client.program.account.externalLivenessAccount.fetchNullable(
    address,
  )) as ExternalLivenessAccount | null;
}

export type HealthScoreAccount = AuraAccounts["healthScoreAccount"];

/** Fetches the `HealthScoreAccount` account state from the cluster. */
export async function fetchHealthScoreAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<HealthScoreAccount> {
  return (await client.program.account.healthScoreAccount.fetch(
    address,
  )) as HealthScoreAccount;
}

/** Fetches the `HealthScoreAccount` account state, or returns null if not found. */
export async function fetchHealthScoreAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<HealthScoreAccount | null> {
  return (await client.program.account.healthScoreAccount.fetchNullable(
    address,
  )) as HealthScoreAccount | null;
}

export type SnapshotAccount = AuraAccounts["snapshotAccount"];

/** Fetches the `SnapshotAccount` account state from the cluster. */
export async function fetchSnapshotAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<SnapshotAccount> {
  return (await client.program.account.snapshotAccount.fetch(
    address,
  )) as SnapshotAccount;
}

/** Fetches the `SnapshotAccount` account state, or returns null if not found. */
export async function fetchSnapshotAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<SnapshotAccount | null> {
  return (await client.program.account.snapshotAccount.fetchNullable(
    address,
  )) as SnapshotAccount | null;
}
