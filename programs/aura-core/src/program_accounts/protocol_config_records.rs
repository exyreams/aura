//! Global monetization control singleton.
//!
//! `ProtocolConfigAccount` is the root of the fee control plane: a single PDA,
//! owned by a protocol authority distinct from any treasury owner, that carries
//! the non-bypassable protocol fee floor and the bounds within which integrators
//! may set their own fees. Treasury fee computation reads the floor from here,
//! so an owner who zeroes their own schedule still pays the protocol's cut.

use super::*;

/// Allocated size for a `ProtocolConfigAccount`.
pub const PROTOCOL_CONFIG_SPACE: usize = 8 + ProtocolConfigAccount::INIT_SPACE;

/// Settlement asset the protocol denominates its accrued fees in.
pub mod settlement_asset {
    /// Native lamports.
    pub const LAMPORTS: u8 = 0;
    /// USDC SPL token.
    pub const USDC: u8 = 1;
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfigAccount {
    /// PDA bump.
    pub bump: u8,
    /// Authority permitted to update this configuration. Set at init and
    /// distinct from any treasury owner.
    pub protocol_authority: Pubkey,
    /// Destination that protocol fees settle to.
    pub protocol_recipient: Pubkey,
    /// Non-bypassable per-transaction fee floor, in basis points.
    pub protocol_fee_bps: u64,
    /// Flat fee charged on treasury creation, in USD.
    pub creation_fee_usd: u64,
    /// Lower bound an integrator may set its own fee to, in basis points.
    pub min_integrator_bps: u16,
    /// Upper bound an integrator may set its own fee to, in basis points.
    pub max_integrator_bps: u16,
    /// Asset the protocol denominates accrued fees in (`settlement_asset`).
    pub settlement_asset: u8,
    /// Whether the protocol fee is currently active.
    pub enabled: bool,
    /// Unix timestamp of the last committed change.
    pub updated_at: i64,
    /// A staged update awaiting its timelock, if any.
    pub pending: Option<PendingProtocolConfig>,
}

/// Economic values staged by `update_protocol_config` and applied by
/// `commit_protocol_config` once `executable_after` has passed.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PendingProtocolConfig {
    pub protocol_authority: Pubkey,
    pub protocol_recipient: Pubkey,
    pub protocol_fee_bps: u64,
    pub creation_fee_usd: u64,
    pub min_integrator_bps: u16,
    pub max_integrator_bps: u16,
    pub settlement_asset: u8,
    pub enabled: bool,
    pub executable_after: i64,
}

impl PendingProtocolConfig {
    /// Validates the staged economic values are internally coherent.
    pub fn validate(&self) -> Result<()> {
        validate_protocol_values(
            self.protocol_fee_bps,
            self.min_integrator_bps,
            self.max_integrator_bps,
            self.settlement_asset,
        )
    }
}

impl ProtocolConfigAccount {
    /// The fee floor enforced on every transaction. Zero when the protocol fee
    /// is disabled, so a disabled config charges nothing.
    pub fn floor_bps(&self) -> u64 {
        if self.enabled {
            self.protocol_fee_bps
        } else {
            0
        }
    }
}

/// Validates protocol economic values are internally coherent.
pub fn validate_protocol_values(
    protocol_fee_bps: u64,
    min_integrator_bps: u16,
    max_integrator_bps: u16,
    settlement_asset: u8,
) -> Result<()> {
    require!(
        protocol_fee_bps <= crate::constants::MAX_PROTOCOL_FEE_BPS,
        AuraCoreError::InvalidProtocolConfig
    );
    require!(
        min_integrator_bps <= max_integrator_bps,
        AuraCoreError::InvalidProtocolConfig
    );
    require!(
        settlement_asset == settlement_asset::LAMPORTS
            || settlement_asset == settlement_asset::USDC,
        AuraCoreError::InvalidProtocolConfig
    );
    Ok(())
}
