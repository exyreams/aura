/** Generated instruction builders for the treasury domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `close_treasury_analytics` instruction. */
export type CloseTreasuryAnalyticsInput = {
  accounts: MethodAccounts<"closeTreasuryAnalytics">;
  args?: undefined;
};

/** Builds a `close_treasury_analytics` instruction. */
export function closeTreasuryAnalytics(
  client: AuraClient,
  input: CloseTreasuryAnalyticsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeTreasuryAnalytics()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeTreasuryAnalyticsInstruction = closeTreasuryAnalytics;

/** Builds and sends a `close_treasury_analytics` transaction. */
export async function sendCloseTreasuryAnalytics(
  client: AuraClient,
  payer: Signer,
  input: CloseTreasuryAnalyticsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeTreasuryAnalytics(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `create_treasury` instruction. */
export type CreateTreasuryInput = {
  accounts: MethodAccounts<"createTreasury">;
  args: MethodArgs<"createTreasury">[0];
};

/** Builds a `create_treasury` instruction. */
export function createTreasury(
  client: AuraClient,
  input: CreateTreasuryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .createTreasury(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const createTreasuryInstruction = createTreasury;

/** Builds and sends a `create_treasury` transaction. */
export async function sendCreateTreasury(
  client: AuraClient,
  payer: Signer,
  input: CreateTreasuryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await createTreasury(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_treasury_analytics` instruction. */
export type InitTreasuryAnalyticsInput = {
  accounts: MethodAccounts<"initTreasuryAnalytics">;
  args: {
    now: MethodArgs<"initTreasuryAnalytics">[0];
  };
};

/** Builds a `init_treasury_analytics` instruction. */
export function initTreasuryAnalytics(
  client: AuraClient,
  input: InitTreasuryAnalyticsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initTreasuryAnalytics(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initTreasuryAnalyticsInstruction = initTreasuryAnalytics;

/** Builds and sends a `init_treasury_analytics` transaction. */
export async function sendInitTreasuryAnalytics(
  client: AuraClient,
  payer: Signer,
  input: InitTreasuryAnalyticsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initTreasuryAnalytics(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `remove_recipient_limit` instruction. */
export type RemoveRecipientLimitInput = {
  accounts: MethodAccounts<"removeRecipientLimit">;
  args: {
    chain: MethodArgs<"removeRecipientLimit">[0];
    address: MethodArgs<"removeRecipientLimit">[1];
    now: MethodArgs<"removeRecipientLimit">[2];
  };
};

/** Builds a `remove_recipient_limit` instruction. */
export function removeRecipientLimit(
  client: AuraClient,
  input: RemoveRecipientLimitInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .removeRecipientLimit(input.args.chain, input.args.address, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const removeRecipientLimitInstruction = removeRecipientLimit;

/** Builds and sends a `remove_recipient_limit` transaction. */
export async function sendRemoveRecipientLimit(
  client: AuraClient,
  payer: Signer,
  input: RemoveRecipientLimitInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await removeRecipientLimit(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_recipient_limit` instruction. */
export type SetRecipientLimitInput = {
  accounts: MethodAccounts<"setRecipientLimit">;
  args: MethodArgs<"setRecipientLimit">[0];
};

/** Builds a `set_recipient_limit` instruction. */
export function setRecipientLimit(
  client: AuraClient,
  input: SetRecipientLimitInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setRecipientLimit(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setRecipientLimitInstruction = setRecipientLimit;

/** Builds and sends a `set_recipient_limit` transaction. */
export async function sendSetRecipientLimit(
  client: AuraClient,
  payer: Signer,
  input: SetRecipientLimitInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setRecipientLimit(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_treasury_metadata` instruction. */
export type UpdateTreasuryMetadataInput = {
  accounts: MethodAccounts<"updateTreasuryMetadata">;
  args: MethodArgs<"updateTreasuryMetadata">[0];
};

/** Builds a `update_treasury_metadata` instruction. */
export function updateTreasuryMetadata(
  client: AuraClient,
  input: UpdateTreasuryMetadataInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateTreasuryMetadata(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateTreasuryMetadataInstruction = updateTreasuryMetadata;

/** Builds and sends a `update_treasury_metadata` transaction. */
export async function sendUpdateTreasuryMetadata(
  client: AuraClient,
  payer: Signer,
  input: UpdateTreasuryMetadataInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateTreasuryMetadata(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
