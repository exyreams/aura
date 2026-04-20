//! On-chain account decoding helpers.

use anchor_lang::AccountDeserialize;
use aura_core::{AgentTreasury, TreasuryAccount};

use crate::SdkError;

/// Re-export the real Anchor treasury account type.
pub use aura_core::TreasuryAccount as OnchainTreasuryAccount;

/// Decodes raw account bytes into the Anchor `TreasuryAccount` record.
pub fn decode_treasury_account(data: &[u8]) -> Result<TreasuryAccount, SdkError> {
    let mut bytes = data;
    TreasuryAccount::try_deserialize(&mut bytes).map_err(|error| SdkError::AccountDecode {
        account_name: "TreasuryAccount",
        message: error.to_string(),
    })
}

/// Decodes raw account bytes into the rich `AgentTreasury` domain model.
pub fn decode_treasury_domain(data: &[u8]) -> Result<AgentTreasury, SdkError> {
    let record = decode_treasury_account(data)?;
    record
        .to_domain()
        .map_err(|error| SdkError::DomainDecode(error.to_string()))
}
