/// Computes slippage in basis points from expected and actual output amounts.
///
/// Returns `0` if `expected_output_usd` is zero or if `actual_output_usd`
/// is at least as large as expected (no negative slippage). Otherwise:
/// `slippage_bps = (expected - actual) * 10_000 / expected`
pub fn slippage_bps(expected_output_usd: u64, actual_output_usd: u64) -> u64 {
    if expected_output_usd == 0 || actual_output_usd >= expected_output_usd {
        return 0;
    }

    let diff = expected_output_usd - actual_output_usd;
    diff.saturating_mul(10_000) / expected_output_usd
}
