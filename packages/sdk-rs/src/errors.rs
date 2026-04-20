//! SDK error types.

use solana_sdk::pubkey::Pubkey;

/// All errors returned by the Rust SDK.
#[derive(Debug, thiserror::Error)]
pub enum SdkError {
    /// Solana RPC returned an error.
    #[error("RPC error: {0}")]
    Rpc(#[from] solana_client::client_error::ClientError),

    /// The requested account does not exist on-chain.
    #[error("account not found: {0}")]
    AccountNotFound(Pubkey),

    /// Anchor account decoding failed.
    #[error("failed to decode {account_name}: {message}")]
    AccountDecode {
        /// Human-readable account type.
        account_name: &'static str,
        /// Decoder failure detail.
        message: String,
    },

    /// Converting a stored treasury record back into the domain model failed.
    #[error("failed to decode treasury domain: {0}")]
    DomainDecode(String),

    /// The client was asked to submit a transaction without a configured payer.
    #[error("client has no default payer configured")]
    MissingDefaultPayer,

    /// A caller-supplied parameter was invalid before any RPC call was made.
    #[error("invalid parameter: {0}")]
    InvalidParameter(String),
}
