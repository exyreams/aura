/// Protocol fee schedule applied to executed transactions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtocolFees {
    /// Flat fee charged when a treasury is created, in USD.
    pub treasury_creation_fee_usd: u64,
    /// Per-transaction fee in basis points (1 bps = 0.01%).
    pub transaction_fee_bps: u64,
    /// FHE subsidy in basis points — reduces the effective fee for confidential proposals.
    pub fhe_subsidy_bps: u64,
}

impl Default for ProtocolFees {
    fn default() -> Self {
        Self {
            treasury_creation_fee_usd: 100,
            transaction_fee_bps: 10,
            fhe_subsidy_bps: 5_000,
        }
    }
}

impl ProtocolFees {
    /// Computes the transaction fee for `amount_usd` using `transaction_fee_bps`.
    pub fn fee_for_amount(&self, amount_usd: u64) -> u64 {
        amount_usd.saturating_mul(self.transaction_fee_bps) / 10_000
    }
}
