//! Fee schedule: the full set of fee models AURA can charge.
//!
//! Generalizes the flat `ProtocolFees` (single per-tx bps) into a schedule with
//! per-transaction-type rates, volume tiers, min/max clamps, flat fees, recurring
//! (subscription / AUM) fees, and discounts — merged across the protocol /
//! integrator / owner layers into one effective fee. The protocol-floor portion
//! (from the global `ProtocolConfig`) is non-bypassable: discounts and the owner
//! layer can reduce the integrator/owner cut but never the protocol's.
//!
//! This is pure domain logic with no Anchor dependency; the on-chain serialized
//! form lives in `program_accounts/fee_schedule_records.rs` on a sidecar PDA so
//! the treasury account stays within the SBF stack-frame limit.

use crate::state::fees::ProtocolFees;

/// Maximum per-transaction-type rate overrides in a schedule.
pub const MAX_FEE_TYPE_RATES: usize = 5;
/// Maximum volume tiers in a schedule.
pub const MAX_FEE_TIERS: usize = 4;

/// A per-transaction-type bps override.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct FeeTypeRate {
    /// Transaction-type code (see `transaction_type_code`).
    pub tx_type: u8,
    pub bps: u64,
}

/// A volume tier: once cumulative `volume_usd` reaches `threshold_usd`, `bps`
/// becomes the base rate. Tiers are stored ascending by threshold.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct FeeTier {
    pub threshold_usd: u64,
    pub bps: u64,
}

/// Inputs to an effective-fee computation for one transaction.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct FeeContext {
    pub amount_usd: u64,
    pub tx_type_code: u8,
    /// Rolling volume used to resolve the active tier.
    pub volume_usd: u64,
    /// Confidential proposals receive the FHE subsidy.
    pub is_confidential: bool,
    /// Whether the treasury qualifies for the reputation/tier discount.
    pub reputation_discount: bool,
    /// Whether a referral discount applies.
    pub referral_discount: bool,
    /// Non-bypassable protocol fee floor, in bps (0 when disabled / no config).
    pub protocol_floor_bps: u64,
}

/// The full fee model surface for a treasury.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct FeeSchedule {
    /// Base per-tx rate when no per-type override or tier applies.
    pub base_bps: u64,
    /// Per-transaction-type rate overrides (take precedence over tiers/base).
    pub per_type_bps: Vec<FeeTypeRate>,
    /// Volume tiers (ascending by threshold).
    pub tiers: Vec<FeeTier>,
    /// Lower clamp so dust transfers still pay something.
    pub min_fee_usd: u64,
    /// Optional ceiling so a whale transfer isn't gouged.
    pub max_fee_usd: Option<u64>,
    /// Flat fee charged at treasury creation.
    pub creation_fee_usd: u64,
    /// Recurring platform fee per period.
    pub subscription_usd_per_period: u64,
    pub subscription_period_secs: i64,
    /// Bps of AUM charged per period.
    pub aum_bps_per_period: u64,
    /// Discount bps applied to confidential proposals.
    pub fhe_subsidy_bps: u64,
    /// Discount bps for high-trust/reputation treasuries.
    pub reputation_discount_bps: u64,
    /// Discount bps for a recorded referral.
    pub referral_discount_bps: u64,
    /// Cap on the total combined discount.
    pub discount_cap_bps: u64,
    /// Integrator layer (bounded by `ProtocolConfig` at apply time).
    pub integrator_bps: u64,
    /// Owner surcharge (additive only).
    pub owner_surcharge_bps: u64,
}

/// Transaction-type codes used by per-type rates (mirrors `transaction_type_code`).
const TX_TYPE_TRANSFER: u8 = 0;
const TX_TYPE_DEFI_SWAP: u8 = 1;

/// Built-in billing shapes keyed by org type. Each builds a full `FeeSchedule`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BillingProfileKind {
    Payroll = 1,
    TradingDesk = 2,
    DaoTreasury = 3,
    GrantProgram = 4,
    VendorPayments = 5,
    ColdStorage = 6,
    Specialty = 7,
}

impl BillingProfileKind {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            1 => Some(Self::Payroll),
            2 => Some(Self::TradingDesk),
            3 => Some(Self::DaoTreasury),
            4 => Some(Self::GrantProgram),
            5 => Some(Self::VendorPayments),
            6 => Some(Self::ColdStorage),
            7 => Some(Self::Specialty),
            _ => None,
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }
}

/// One month, used as the default recurring period.
const MONTH_SECS: i64 = 30 * 86_400;

/// Builds a coherent `FeeSchedule` for a billing profile kind.
pub fn build_billing_profile(kind: BillingProfileKind) -> FeeSchedule {
    match kind {
        // Near-zero per-tx on transfers, a dust floor, and a flat subscription.
        BillingProfileKind::Payroll => FeeSchedule {
            base_bps: 0,
            per_type_bps: vec![FeeTypeRate {
                tx_type: TX_TYPE_TRANSFER,
                bps: 0,
            }],
            min_fee_usd: 1,
            subscription_usd_per_period: 50,
            subscription_period_secs: MONTH_SECS,
            ..FeeSchedule::default()
        },
        // Swap bps with volume tiers and a ceiling.
        BillingProfileKind::TradingDesk => FeeSchedule {
            base_bps: 0,
            per_type_bps: vec![FeeTypeRate {
                tx_type: TX_TYPE_DEFI_SWAP,
                bps: 30,
            }],
            tiers: vec![
                FeeTier {
                    threshold_usd: 100_000,
                    bps: 20,
                },
                FeeTier {
                    threshold_usd: 1_000_000,
                    bps: 10,
                },
            ],
            max_fee_usd: Some(5_000),
            ..FeeSchedule::default()
        },
        // AUM/management fee per month plus a low per-tx base.
        BillingProfileKind::DaoTreasury => FeeSchedule {
            base_bps: 5,
            aum_bps_per_period: 10,
            subscription_period_secs: MONTH_SECS,
            ..FeeSchedule::default()
        },
        // Flat per-disbursement fee (via the min-fee floor), no per-tx bps.
        BillingProfileKind::GrantProgram => FeeSchedule {
            base_bps: 0,
            min_fee_usd: 5,
            ..FeeSchedule::default()
        },
        // Modest per-transfer fee with a recipient-allowlist reputation discount.
        BillingProfileKind::VendorPayments => FeeSchedule {
            base_bps: 0,
            per_type_bps: vec![FeeTypeRate {
                tx_type: TX_TYPE_TRANSFER,
                bps: 5,
            }],
            reputation_discount_bps: 1_000,
            discount_cap_bps: 2_000,
            ..FeeSchedule::default()
        },
        // Subscription-only with negligible per-tx activity.
        BillingProfileKind::ColdStorage => FeeSchedule {
            base_bps: 1,
            subscription_usd_per_period: 10,
            subscription_period_secs: MONTH_SECS,
            ..FeeSchedule::default()
        },
        // Neutral defaults intended to be forked and customized.
        BillingProfileKind::Specialty => FeeSchedule::default(),
    }
}

/// Coherence failures for a fee schedule.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FeeScheduleInvariant {
    MinExceedsMax,
    TiersNotMonotonic,
    DiscountExceedsCap,
    RateOutOfRange,
}

impl Default for FeeSchedule {
    fn default() -> Self {
        Self {
            base_bps: 10,
            per_type_bps: Vec::new(),
            tiers: Vec::new(),
            min_fee_usd: 0,
            max_fee_usd: None,
            creation_fee_usd: 0,
            subscription_usd_per_period: 0,
            subscription_period_secs: 0,
            aum_bps_per_period: 0,
            fhe_subsidy_bps: 0,
            reputation_discount_bps: 0,
            referral_discount_bps: 0,
            discount_cap_bps: 0,
            integrator_bps: 0,
            owner_surcharge_bps: 0,
        }
    }
}

impl FeeSchedule {
    /// Back-compat: a flat `ProtocolFees` maps to a single base tier.
    pub fn from_protocol_fees(fees: &ProtocolFees) -> Self {
        Self {
            base_bps: fees.transaction_fee_bps,
            creation_fee_usd: fees.treasury_creation_fee_usd,
            fhe_subsidy_bps: fees.fhe_subsidy_bps,
            ..Self::default()
        }
    }

    /// Resolves the base rate (bps) before the integrator/owner layers: a
    /// per-type override wins; otherwise the highest tier whose threshold is met;
    /// otherwise `base_bps`.
    pub fn base_rate_bps(&self, tx_type_code: u8, volume_usd: u64) -> u64 {
        if let Some(rate) = self
            .per_type_bps
            .iter()
            .find(|rate| rate.tx_type == tx_type_code)
        {
            return rate.bps;
        }
        let mut bps = self.base_bps;
        for tier in &self.tiers {
            if volume_usd >= tier.threshold_usd {
                bps = tier.bps;
            }
        }
        bps
    }

    fn total_discount_bps(&self, ctx: &FeeContext) -> u64 {
        let mut discount = 0u64;
        if ctx.is_confidential {
            discount = discount.saturating_add(self.fhe_subsidy_bps);
        }
        if ctx.reputation_discount {
            discount = discount.saturating_add(self.reputation_discount_bps);
        }
        if ctx.referral_discount {
            discount = discount.saturating_add(self.referral_discount_bps);
        }
        discount.min(self.discount_cap_bps)
    }

    /// Computes the effective per-transaction fee in USD across all three layers.
    /// Discounts never reduce the fee below the protocol floor.
    pub fn transaction_fee(&self, ctx: &FeeContext) -> u64 {
        let gross_bps = self
            .base_rate_bps(ctx.tx_type_code, ctx.volume_usd)
            .saturating_add(self.integrator_bps)
            .saturating_add(self.owner_surcharge_bps);
        let mut fee = ctx.amount_usd.saturating_mul(gross_bps) / 10_000;

        // Clamp the bps fee by the min/max bounds.
        fee = fee.max(self.min_fee_usd);
        if let Some(max_fee) = self.max_fee_usd {
            fee = fee.min(max_fee);
        }

        // Apply discounts to the integrator/owner portion.
        let discount = fee.saturating_mul(self.total_discount_bps(ctx)) / 10_000;
        fee = fee.saturating_sub(discount);

        // The protocol floor is non-bypassable.
        let floor = ctx.amount_usd.saturating_mul(ctx.protocol_floor_bps) / 10_000;
        fee.max(floor)
    }

    /// Checks the schedule is internally coherent. Integrator bounds against the
    /// global `ProtocolConfig` are enforced separately at apply time.
    pub fn validate(&self) -> Result<(), FeeScheduleInvariant> {
        if let Some(max_fee) = self.max_fee_usd {
            if self.min_fee_usd > max_fee {
                return Err(FeeScheduleInvariant::MinExceedsMax);
            }
        }
        // Tiers must be strictly ascending by threshold.
        for window in self.tiers.windows(2) {
            if window[1].threshold_usd <= window[0].threshold_usd {
                return Err(FeeScheduleInvariant::TiersNotMonotonic);
            }
        }
        let max_discount = self
            .fhe_subsidy_bps
            .max(self.reputation_discount_bps)
            .max(self.referral_discount_bps);
        if max_discount > self.discount_cap_bps && self.discount_cap_bps != 0 {
            return Err(FeeScheduleInvariant::DiscountExceedsCap);
        }
        // No single rate or layer may exceed 100%.
        let rates = self
            .per_type_bps
            .iter()
            .map(|rate| rate.bps)
            .chain(self.tiers.iter().map(|tier| tier.bps))
            .chain([self.base_bps, self.integrator_bps, self.owner_surcharge_bps]);
        for bps in rates {
            if bps > 10_000 {
                return Err(FeeScheduleInvariant::RateOutOfRange);
            }
        }
        Ok(())
    }
}
