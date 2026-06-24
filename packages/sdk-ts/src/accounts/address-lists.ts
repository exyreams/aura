/** Generated account fetchers for the address-lists domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type AddressListAccount = AuraAccounts["addressListAccount"];

/** Fetches the `AddressListAccount` account state from the cluster. */
export async function fetchAddressListAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<AddressListAccount> {
  return (await client.program.account.addressListAccount.fetch(
    address,
  )) as AddressListAccount;
}

/** Fetches the `AddressListAccount` account state, or returns null if not found. */
export async function fetchAddressListAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<AddressListAccount | null> {
  return (await client.program.account.addressListAccount.fetchNullable(
    address,
  )) as AddressListAccount | null;
}

export type BillingTemplate = AuraAccounts["billingTemplate"];

/** Fetches the `BillingTemplate` account state from the cluster. */
export async function fetchBillingTemplate(
  client: AuraClient,
  address: PublicKey,
): Promise<BillingTemplate> {
  return (await client.program.account.billingTemplate.fetch(
    address,
  )) as BillingTemplate;
}

/** Fetches the `BillingTemplate` account state, or returns null if not found. */
export async function fetchBillingTemplateNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<BillingTemplate | null> {
  return (await client.program.account.billingTemplate.fetchNullable(
    address,
  )) as BillingTemplate | null;
}
