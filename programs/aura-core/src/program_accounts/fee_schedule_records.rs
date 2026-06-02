//! On-chain serialization for the fee schedule.
//!
//! The schedule lives on a sidecar `FeeScheduleAccount` PDA (not on the treasury
//! record) to keep `TreasuryAccount` within the SBF stack-frame limit. When the
//! sidecar is absent, fee computation falls back to the treasury's legacy
//! `ProtocolFees` as a single base tier.

use super::*;

/// Allocated size for a `FeeScheduleAccount`.
pub const FEE_SCHEDULE_SPACE: usize = 8 + FeeScheduleAccount::INIT_SPACE;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct FeeTypeRateRecord {
    pub tx_type: u8,
    pub bps: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct FeeTierRecord {
    pub threshold_usd: u64,
    pub bps: u64,
}

/// Serialized form of `FeeSchedule`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct FeeScheduleRecord {
    pub base_bps: u64,
    #[max_len(5)]
    pub per_type_bps: Vec<FeeTypeRateRecord>,
    #[max_len(4)]
    pub tiers: Vec<FeeTierRecord>,
    pub min_fee_usd: u64,
    pub max_fee_usd: Option<u64>,
    pub creation_fee_usd: u64,
    pub subscription_usd_per_period: u64,
    pub subscription_period_secs: i64,
    pub aum_bps_per_period: u64,
    pub fhe_subsidy_bps: u64,
    pub reputation_discount_bps: u64,
    pub referral_discount_bps: u64,
    pub discount_cap_bps: u64,
    pub integrator_bps: u64,
    pub owner_surcharge_bps: u64,
}

impl FeeScheduleRecord {
    pub fn from_domain(domain: &FeeSchedule) -> Self {
        Self {
            base_bps: domain.base_bps,
            per_type_bps: domain
                .per_type_bps
                .iter()
                .map(|rate| FeeTypeRateRecord {
                    tx_type: rate.tx_type,
                    bps: rate.bps,
                })
                .collect(),
            tiers: domain
                .tiers
                .iter()
                .map(|tier| FeeTierRecord {
                    threshold_usd: tier.threshold_usd,
                    bps: tier.bps,
                })
                .collect(),
            min_fee_usd: domain.min_fee_usd,
            max_fee_usd: domain.max_fee_usd,
            creation_fee_usd: domain.creation_fee_usd,
            subscription_usd_per_period: domain.subscription_usd_per_period,
            subscription_period_secs: domain.subscription_period_secs,
            aum_bps_per_period: domain.aum_bps_per_period,
            fhe_subsidy_bps: domain.fhe_subsidy_bps,
            reputation_discount_bps: domain.reputation_discount_bps,
            referral_discount_bps: domain.referral_discount_bps,
            discount_cap_bps: domain.discount_cap_bps,
            integrator_bps: domain.integrator_bps,
            owner_surcharge_bps: domain.owner_surcharge_bps,
        }
    }

    pub fn to_domain(&self) -> FeeSchedule {
        FeeSchedule {
            base_bps: self.base_bps,
            per_type_bps: self
                .per_type_bps
                .iter()
                .map(|rate| FeeTypeRate {
                    tx_type: rate.tx_type,
                    bps: rate.bps,
                })
                .collect(),
            tiers: self
                .tiers
                .iter()
                .map(|tier| FeeTier {
                    threshold_usd: tier.threshold_usd,
                    bps: tier.bps,
                })
                .collect(),
            min_fee_usd: self.min_fee_usd,
            max_fee_usd: self.max_fee_usd,
            creation_fee_usd: self.creation_fee_usd,
            subscription_usd_per_period: self.subscription_usd_per_period,
            subscription_period_secs: self.subscription_period_secs,
            aum_bps_per_period: self.aum_bps_per_period,
            fhe_subsidy_bps: self.fhe_subsidy_bps,
            reputation_discount_bps: self.reputation_discount_bps,
            referral_discount_bps: self.referral_discount_bps,
            discount_cap_bps: self.discount_cap_bps,
            integrator_bps: self.integrator_bps,
            owner_surcharge_bps: self.owner_surcharge_bps,
        }
    }
}

/// Sidecar account holding a treasury's fee schedule.
#[account]
#[derive(InitSpace)]
pub struct FeeScheduleAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub updated_at: i64,
    pub schedule: FeeScheduleRecord,
}
