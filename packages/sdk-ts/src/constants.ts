/**
 * Program IDs, PDA seeds, and IDL-derived type aliases for the AURA SDK.
 *
 * All values here are derived from the generated IDL so they stay in sync
 * with the deployed program automatically. Do not hard-code program IDs or
 * seeds elsewhere in the SDK — import them from this module.
 */

import type { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import type { AuraCore } from "./generated/aura_core.js";
import idlJson from "./generated/aura_core.json" with { type: "json" };

/** The raw Anchor IDL object. Exported at `@aura-protocol/sdk-ts/idl` as well. */
export const AURA_IDL = idlJson as AuraCore;

/** The deployed `aura-core` program ID, read directly from the IDL address field. */
export const AURA_PROGRAM_ID = new PublicKey(AURA_IDL.address);

/** Ika dWallet program ID on Solana devnet (pre-alpha). */
export const DWALLET_DEVNET_PROGRAM_ID = new PublicKey(
  "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
);

/** Ika Encrypt program ID on Solana devnet (pre-alpha). */
export const ENCRYPT_DEVNET_PROGRAM_ID = new PublicKey(
  "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
);

/** Default Solana devnet RPC endpoint. */
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

// PDA seeds — must match the constants defined in `programs/aura-core/src/constants.rs`.

/** Seed for the treasury PDA: `[b"treasury", owner, agentId]`. */
export const TREASURY_SEED = Buffer.from("treasury");

/** Seed for AURA's dWallet CPI authority PDA. */
export const DWALLET_CPI_AUTHORITY_SEED = Buffer.from("__ika_cpi_authority");

/** Seed for AURA's Encrypt CPI authority PDA. */
export const ENCRYPT_CPI_AUTHORITY_SEED = Buffer.from("__encrypt_cpi_authority");

/** Seed for the Encrypt program's event authority PDA (derived on the Encrypt program). */
export const ENCRYPT_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

/** Seed for the dWallet `MessageApproval` PDA (derived on the dWallet program). */
export const MESSAGE_APPROVAL_SEED = Buffer.from("message_approval");

// IDL-derived type aliases. These are the canonical TypeScript types for all
// on-chain account and instruction argument shapes. Import them instead of
// writing the types by hand.

/** All account types keyed by their Anchor account name. */
export type AuraAccountTypes = IdlAccounts<AuraCore>;

/** All instruction argument and struct types keyed by their IDL name. */
export type AuraTypeDefs = IdlTypes<AuraCore>;

/** Deserialized `TreasuryAccount` as returned by `program.account.treasuryAccount.fetch`. */
export type TreasuryAccountRecord = AuraAccountTypes["treasuryAccount"];

/** Arguments for the `create_treasury` instruction. */
export type CreateTreasuryArgs = AuraTypeDefs["createTreasuryArgs"];

/** Arguments for the `register_dwallet` instruction. */
export type RegisterDwalletArgs = AuraTypeDefs["registerDwalletArgs"];

/** Arguments for the `propose_transaction` instruction. */
export type ProposeTransactionArgs = AuraTypeDefs["proposeTransactionArgs"];

/**
 * Arguments shared by `propose_confidential_transaction` and
 * `propose_confidential_vector_transaction`.
 */
export type ProposeConfidentialTransactionArgs =
  AuraTypeDefs["proposeConfidentialTransactionArgs"];

/** Arguments for the `configure_multisig` instruction. */
export type ConfigureMultisigArgs = AuraTypeDefs["configureMultisigArgs"];

/** Arguments for the `configure_swarm` instruction. */
export type ConfigureSwarmArgs = AuraTypeDefs["configureSwarmArgs"];
