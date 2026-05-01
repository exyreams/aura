/// Computes integer mean and standard deviation for transaction amounts.
///
/// The returned values use the same units as the input values. All arithmetic
/// is integer and saturating so it is safe for on-chain execution.
pub fn compute_stats_integer(amounts: &[u64]) -> (u64, u64) {
    if amounts.is_empty() {
        return (0, 0);
    }

    let n = amounts.len() as u64;
    let mean = amounts
        .iter()
        .fold(0u64, |acc, amount| acc.saturating_add(*amount))
        / n;

    let variance = amounts
        .iter()
        .map(|&amount| amount.abs_diff(mean).saturating_mul(amount.abs_diff(mean)) / n)
        .fold(0u64, |acc, value| acc.saturating_add(value));

    (mean, isqrt(variance))
}

/// Integer square root using Newton's method.
pub fn isqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }

    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Returns z-score in basis points (`z * 10_000`).
pub fn z_score_bps(value: u64, mean: u64, std_dev: u64) -> u64 {
    if std_dev == 0 {
        return 0;
    }

    value.abs_diff(mean).saturating_mul(10_000) / std_dev
}
