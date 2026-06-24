/** Generated instruction builders for the address-lists domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `clear_address_list` instruction. */
export type ClearAddressListInput = {
  accounts: MethodAccounts<"clearAddressList">;
  args: {
    now: MethodArgs<"clearAddressList">[0];
  };
};

/** Builds a `clear_address_list` instruction. */
export function clearAddressList(
  client: AuraClient,
  input: ClearAddressListInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .clearAddressList(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const clearAddressListInstruction = clearAddressList;

/** Builds and sends a `clear_address_list` transaction. */
export async function sendClearAddressList(
  client: AuraClient,
  payer: Signer,
  input: ClearAddressListInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await clearAddressList(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_address_list` instruction. */
export type CloseAddressListInput = {
  accounts: MethodAccounts<"closeAddressList">;
  args?: undefined;
};

/** Builds a `close_address_list` instruction. */
export function closeAddressList(
  client: AuraClient,
  input: CloseAddressListInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeAddressList()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeAddressListInstruction = closeAddressList;

/** Builds and sends a `close_address_list` transaction. */
export async function sendCloseAddressList(
  client: AuraClient,
  payer: Signer,
  input: CloseAddressListInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeAddressList(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_address_list` instruction. */
export type InitAddressListInput = {
  accounts: MethodAccounts<"initAddressList">;
  args: {
    mode: MethodArgs<"initAddressList">[0];
    chain: MethodArgs<"initAddressList">[1];
    now: MethodArgs<"initAddressList">[2];
  };
};

/** Builds a `init_address_list` instruction. */
export function initAddressList(
  client: AuraClient,
  input: InitAddressListInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initAddressList(input.args.mode, input.args.chain, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initAddressListInstruction = initAddressList;

/** Builds and sends a `init_address_list` transaction. */
export async function sendInitAddressList(
  client: AuraClient,
  payer: Signer,
  input: InitAddressListInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initAddressList(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `manage_address_list` instruction. */
export type ManageAddressListInput = {
  accounts: MethodAccounts<"manageAddressList">;
  args: {
    mode: MethodArgs<"manageAddressList">[0];
    chain: MethodArgs<"manageAddressList">[1];
    addresses: MethodArgs<"manageAddressList">[2];
    now: MethodArgs<"manageAddressList">[3];
  };
};

/** Builds a `manage_address_list` instruction. */
export function manageAddressList(
  client: AuraClient,
  input: ManageAddressListInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .manageAddressList(
      input.args.mode,
      input.args.chain,
      input.args.addresses,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const manageAddressListInstruction = manageAddressList;

/** Builds and sends a `manage_address_list` transaction. */
export async function sendManageAddressList(
  client: AuraClient,
  payer: Signer,
  input: ManageAddressListInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await manageAddressList(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_address_list_entry` instruction. */
export type UpdateAddressListEntryInput = {
  accounts: MethodAccounts<"updateAddressListEntry">;
  args: {
    address: MethodArgs<"updateAddressListEntry">[0];
    add: MethodArgs<"updateAddressListEntry">[1];
    now: MethodArgs<"updateAddressListEntry">[2];
  };
};

/** Builds a `update_address_list_entry` instruction. */
export function updateAddressListEntry(
  client: AuraClient,
  input: UpdateAddressListEntryInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateAddressListEntry(input.args.address, input.args.add, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateAddressListEntryInstruction = updateAddressListEntry;

/** Builds and sends a `update_address_list_entry` transaction. */
export async function sendUpdateAddressListEntry(
  client: AuraClient,
  payer: Signer,
  input: UpdateAddressListEntryInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateAddressListEntry(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
