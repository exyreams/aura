/** Generated account fetchers for the treasury domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import { type PublicKey, SystemProgram } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import { AURA_PROGRAM_ID, type CreateTreasuryArgs } from "../constants.js";
import type { AuraCore } from "../generated/aura_core.js";
import type { CreateTreasuryInput } from "../instructions/treasury.js";
import { deriveTreasuryAddress } from "../pda.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export interface CreateTreasuryInputOptions {
  owner: PublicKey;
  args: CreateTreasuryArgs;
  treasury?: PublicKey;
  programId?: PublicKey;
}

export interface PreparedCreateTreasuryInput {
  treasury: PublicKey;
  input: CreateTreasuryInput;
}

export function derive(
  owner: PublicKey,
  agentId: string,
  programId: PublicKey = AURA_PROGRAM_ID,
): [PublicKey, number] {
  return deriveTreasuryAddress(owner, agentId, programId);
}

export function createTreasuryInput(
  options: CreateTreasuryInputOptions,
): PreparedCreateTreasuryInput {
  const treasury =
    options.treasury ??
    deriveTreasuryAddress(
      options.owner,
      options.args.agentId,
      options.programId,
    )[0];
  return {
    treasury,
    input: {
      accounts: {
        owner: options.owner,
        treasury,
        systemProgram: SystemProgram.programId,
      },
      args: options.args,
    },
  };
}

export type TreasuryAccount = AuraAccounts["treasuryAccount"];

/** Fetches the `TreasuryAccount` account state from the cluster. */
export async function fetchTreasuryAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<TreasuryAccount> {
  return (await client.program.account.treasuryAccount.fetch(
    address,
  )) as TreasuryAccount;
}

/** Fetches the `TreasuryAccount` account state, or returns null if not found. */
export async function fetchTreasuryAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<TreasuryAccount | null> {
  return (await client.program.account.treasuryAccount.fetchNullable(
    address,
  )) as TreasuryAccount | null;
}

export type TreasuryAnalyticsAccount = AuraAccounts["treasuryAnalyticsAccount"];

/** Fetches the `TreasuryAnalyticsAccount` account state from the cluster. */
export async function fetchTreasuryAnalyticsAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<TreasuryAnalyticsAccount> {
  return (await client.program.account.treasuryAnalyticsAccount.fetch(
    address,
  )) as TreasuryAnalyticsAccount;
}

/** Fetches the `TreasuryAnalyticsAccount` account state, or returns null if not found. */
export async function fetchTreasuryAnalyticsAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<TreasuryAnalyticsAccount | null> {
  return (await client.program.account.treasuryAnalyticsAccount.fetchNullable(
    address,
  )) as TreasuryAnalyticsAccount | null;
}
