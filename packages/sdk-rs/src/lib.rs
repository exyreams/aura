//! Rust SDK for the deployed `aura-core` program.
//!
//! This crate stays deliberately thin and trustworthy. Instead of redefining
//! the program surface, it reuses the real Anchor-generated instruction/account
//! types from `aura-core` and adds the off-chain pieces clients need:
//!
//! - PDA derivation helpers
//! - instruction builders for all 18 entrypoints
//! - treasury account decoding
//! - a synchronous RPC client for fetches and transaction submission
//!
//! ```rust,no_run
//! use aura_sdk::{types::CreateTreasuryArgs, AuraClient, AURA_DEVNET_PROGRAM_ID};
//! use aura_sdk::types::{PolicyConfig, PolicyConfigRecord, ProtocolFees, ProtocolFeesRecord};
//! use solana_commitment_config::CommitmentConfig;
//! use solana_sdk::signature::{Keypair, Signer};
//!
//! let client = AuraClient::with_options(
//!     "https://api.devnet.solana.com",
//!     AURA_DEVNET_PROGRAM_ID,
//!     CommitmentConfig::confirmed(),
//! );
//!
//! let owner = Keypair::new();
//! let args = CreateTreasuryArgs {
//!     agent_id: "agent-1".to_string(),
//!     ai_authority: owner.pubkey(),
//!     created_at: 0,
//!     pending_transaction_ttl_secs: 900,
//!     policy_config: PolicyConfigRecord::from_domain(&PolicyConfig::default()),
//!     protocol_fees: ProtocolFeesRecord::from_domain(&ProtocolFees::default()),
//! };
//! let (_treasury, instruction) = client.create_treasury_instruction(owner.pubkey(), args);
//! assert_eq!(instruction.program_id, AURA_DEVNET_PROGRAM_ID);
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod accounts;
pub mod client;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod pda;
pub mod types;
pub mod utils;

pub use aura_core::{accounts as anchor_accounts, instruction as anchor_instruction};
pub use client::AuraClient;
pub use errors::SdkError;
pub use types::*;

use solana_sdk::pubkey;
use solana_sdk::pubkey::Pubkey;

/// AURA program ID on Solana devnet.
pub const AURA_DEVNET_PROGRAM_ID: Pubkey = pubkey!("2fHkM5fb8iLt5ojkubAcLpAjgkF1QL1iEXivKZmPw3ya");

/// dWallet program ID on Ika devnet (pre-alpha).
pub const DWALLET_DEVNET_PROGRAM_ID: Pubkey =
    pubkey!("87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY");

/// Encrypt program ID on Ika devnet (pre-alpha).
pub const ENCRYPT_DEVNET_PROGRAM_ID: Pubkey =
    pubkey!("4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");
