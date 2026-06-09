use super::spec::PolicyGraphSpec;
use encrypt_dsl::prelude::encrypt_fn;
#[allow(unused_imports)]
use encrypt_dsl::types::EUint64Vector;
use encrypt_solana_types::cpi::EncryptCpi;

/// Returns the spec for the batch transaction evaluation graph.
///
/// Used by `evaluate_batch_preview` for off-chain simulation of queued
/// or previewed transactions.
pub fn batch_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "evaluate_transaction_batch",
        outputs: &["batch_results", "final_policy_state"],
        uses_update_mode: true,
        requires_decryption: true,
        purpose: "Batch evaluation graph for queued or previewed transactions.",
    }
}

/// Returns the spec for the confidential vector batch policy graph.
///
/// V1 uses fixed-size Encrypt `EUint64Vector` inputs for item amounts and
/// per-item limits, padded with zeros beyond the public active item count.
/// Enforcement outputs stay scalar reductions so the decryption boundary only
/// reveals a small verdict and aggregate total.
pub fn confidential_batch_vector_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "confidential_batch_vector_v1",
        outputs: &["violation_code", "batch_total"],
        uses_update_mode: false,
        requires_decryption: true,
        purpose:
            "Encrypted batch policy over padded EUint64Vector inputs with scalar reduction outputs.",
    }
}

/// Vector primitive for confidential batch item-limit checks.
///
/// Inputs are fixed-width `EUint64Vector` ciphertexts. The active batch items
/// occupy the first `n <= MAX_BATCH_ITEMS` lanes and unused lanes are padded
/// with zero. The output is a vector of `0/1` lanes indicating whether each
/// amount exceeds its matching per-item limit.
#[encrypt_fn]
pub fn confidential_batch_item_limit_vector_graph(
    amounts: EUint64Vector,
    per_item_limits: EUint64Vector,
) -> EUint64Vector {
    amounts > per_item_limits
}

/// Returns the compiled confidential batch item-limit vector graph bytes.
pub fn confidential_batch_item_limit_vector_graph_bytes() -> Vec<u8> {
    confidential_batch_item_limit_vector_graph()
}

/// Submits the confidential batch item-limit vector graph via CPI.
pub fn execute_confidential_batch_item_limit_vector_graph<'a, C>(
    ctx: &'a C,
    amounts: C::Account<'a>,
    per_item_limits: C::Account<'a>,
    item_violation_output: C::Account<'a>,
) -> Result<(), C::Error>
where
    C: EncryptCpi,
{
    ctx.confidential_batch_item_limit_vector_graph(amounts, per_item_limits, item_violation_output)
}
