use super::spec::PolicyGraphSpec;
use encrypt_dsl::prelude::encrypt_fn;
#[allow(unused_imports)]
use encrypt_dsl::traits::VectorOps;
#[allow(unused_imports)]
use encrypt_dsl::types::{EUint64, EUint64Vector};
use encrypt_solana_types::cpi::EncryptCpi;

/// Scalar confidential guardrails graph.
///
/// Inputs:  daily_limit, per_tx_limit, spent_today, proposed_amount (all EUint64)
/// Outputs: (violation_code, next_spent_today)
///
/// violation_code: 0 = approved, 1 = per-tx limit exceeded, 2 = daily limit exceeded
///
/// Uses arithmetic to produce violation codes without bare integer branches:
///   per_tx_exceeded (0 or 1) * 1  +  daily_exceeded (0 or 1) * 2 * (1 - per_tx_exceeded)
#[encrypt_fn]
pub fn confidential_spend_guardrails_graph(
    daily_limit: EUint64,
    per_tx_limit: EUint64,
    spent_today: EUint64,
    proposed_amount: EUint64,
) -> (EUint64, EUint64) {
    let projected_daily_spend = spent_today + proposed_amount;

    // per_tx_exceeded is 1 if proposed_amount > per_tx_limit, else 0
    let per_tx_exceeded = proposed_amount > per_tx_limit;
    // daily_exceeded is 1 if projected_daily_spend > daily_limit, else 0
    let daily_exceeded = projected_daily_spend > daily_limit;

    // violation_code = per_tx_exceeded * 1 + (1 - per_tx_exceeded) * daily_exceeded * 2
    // If per_tx exceeded: code = 1
    // Else if daily exceeded: code = 2
    // Else: code = 0
    let not_per_tx = per_tx_exceeded == 0u64;
    let daily_only = not_per_tx * daily_exceeded;
    let violation_code = per_tx_exceeded * 1 + daily_only * 2;

    // next_spent_today: only advance if approved (violation_code == 0)
    let approved = violation_code == 0u64;
    let next_spent_today = if approved {
        projected_daily_spend
    } else {
        spent_today
    };

    (violation_code, next_spent_today)
}

/// Returns the compiled scalar FHE graph as raw bytes for submission to the Encrypt program.
pub fn confidential_spend_guardrails_graph_bytes() -> Vec<u8> {
    confidential_spend_guardrails_graph()
}

/// Returns the spec for the scalar confidential guardrails graph.
pub fn confidential_scalar_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "confidential_spend_guardrails_scalar",
        outputs: &["violation_code", "next_spent_today"],
        uses_update_mode: true,
        requires_decryption: true,
        purpose:
            "Encrypted per-transaction and daily spend guardrails with update-mode spent tracking.",
    }
}

/// Submits the scalar confidential guardrails graph via CPI to the Encrypt program.
///
/// Passes `spent_today` as both an input (current value) and the update-mode
/// output target, so the Encrypt program overwrites it with `next_spent_today`
/// in-place after evaluation.
pub fn execute_confidential_spend_guardrails_graph<'a, C>(
    ctx: &'a C,
    daily_limit: C::Account<'a>,
    per_tx_limit: C::Account<'a>,
    spent_today: C::Account<'a>,
    proposed_amount: C::Account<'a>,
    violation_output: C::Account<'a>,
) -> Result<(), C::Error>
where
    C: EncryptCpi,
{
    ctx.confidential_spend_guardrails_graph(
        daily_limit,
        per_tx_limit,
        spent_today.clone(),
        proposed_amount,
        violation_output,
        spent_today,
    )
}

/// Vector confidential guardrails graph.
///
/// Inputs:
/// - `guardrail_state`: lanes `[remaining_daily_limit, per_tx_limit, spent_today, ...]`
/// - `spend_delta`: lanes `[-amount mod u64, 0, amount, ...]`
/// - `comparison_amounts`: lanes `[amount, amount, 0, ...]`
/// - `flag_indices`: lanes `[3, 4, 5, 6, ...]`
///
/// Output:
/// - lane 0: next remaining daily limit
/// - lane 1: unchanged per-transaction limit
/// - lane 2: next spent-today value
/// - lane 3: daily-limit exceeded flag
/// - lane 4: per-transaction-limit exceeded flag
///
/// The graph intentionally avoids `get` and embedded vector constants because
/// the current Encrypt pre-alpha vector runtime exhausts the 256 KB SBF heap
/// before CPI when graph construction allocates multiple 8,192-byte constants.
#[encrypt_fn]
pub fn confidential_spend_guardrails_vector_graph(
    guardrail_state: EUint64Vector,
    spend_delta: EUint64Vector,
    comparison_amounts: EUint64Vector,
    flag_indices: EUint64Vector,
) -> EUint64Vector {
    let next_state = guardrail_state + spend_delta;
    let violation_flags = comparison_amounts > guardrail_state;

    next_state.assign(&flag_indices, &violation_flags)
}

/// Returns the compiled vector FHE graph as raw bytes for submission to the Encrypt program.
pub fn confidential_spend_guardrails_vector_graph_bytes() -> Vec<u8> {
    confidential_spend_guardrails_vector_graph()
}

/// Returns the spec for the vector confidential guardrails graph.
pub fn confidential_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "confidential_spend_guardrails_vector",
        outputs: &["updated_guardrail_state_with_violation"],
        uses_update_mode: false,
        requires_decryption: true,
        purpose:
            "Heap-safe vector confidential guardrails that return the next encrypted state with violation flags in lanes 3 and 4.",
    }
}

/// Submits the vector confidential guardrails graph via CPI to the Encrypt program.
///
/// The output `policy_result_output` receives the updated guardrail vector with
/// `lane[2] = next_spent_today`, `lane[3] = daily_exceeded`, and
/// `lane[4] = per_tx_exceeded`. The caller promotes this output to the
/// treasury's new guardrail vector ciphertext only after an approval.
pub fn execute_confidential_spend_guardrails_vector_graph<'a, C>(
    ctx: &'a C,
    guardrail_state: C::Account<'a>,
    spend_delta: C::Account<'a>,
    comparison_amounts: C::Account<'a>,
    flag_indices: C::Account<'a>,
    policy_result_output: C::Account<'a>,
) -> Result<(), C::Error>
where
    C: EncryptCpi,
{
    ctx.confidential_spend_guardrails_vector_graph(
        guardrail_state,
        spend_delta,
        comparison_amounts,
        flag_indices,
        policy_result_output,
    )
}
