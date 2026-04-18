use crate::types::{Chain, TransactionType};

/// The raw parameters of a transaction proposal submitted by the AI agent.
///
/// Passed into `PolicyEvaluationContext` and used by every policy rule.
/// Optional fields are only required by the rules that check them — rules
/// that don't need a field simply ignore it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionContext {
    /// Transaction amount in USD.
    pub amount_usd: u64,
    /// Chain on which the transaction will be executed.
    pub target_chain: Chain,
    /// Category of the transaction (transfer, DeFi swap, etc.).
    pub tx_type: TransactionType,
    /// DeFi protocol identifier, checked against `allowed_protocol_bitmap`.
    /// `None` means no specific protocol (e.g. a plain transfer).
    pub protocol_id: Option<u8>,
    /// Unix timestamp of proposal submission, used for time-window and
    /// quote-freshness checks.
    pub current_timestamp: i64,
    /// Expected output amount in USD, used for slippage calculation.
    pub expected_output_usd: Option<u64>,
    /// Actual output amount in USD, used for slippage calculation.
    pub actual_output_usd: Option<u64>,
    /// Age of the price quote in seconds, checked against `max_quote_age_secs`.
    pub quote_age_secs: Option<u64>,
    /// Counterparty risk score (0–100), checked against `max_counterparty_risk_score`.
    pub counterparty_risk_score: Option<u8>,
}
