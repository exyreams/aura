//! Conditional / triggered execution descriptors.
//!
//! A bounded set of [`Condition`]s can gate a proposal or scheduled intent so it
//! executes **only when** a price band, time window, balance threshold, or
//! oracle flag holds. [`evaluate_conditions`] is a pure predicate over inputs the
//! caller already has (feed price, `now`, available balance, oracle flag); it
//! gates *entry*, while the normal policy pipeline still gates the spend.

/// The kinds of trigger a condition can express.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConditionKind {
    PriceBelow = 0,
    PriceAbove = 1,
    TimeWindow = 2,
    BalanceAbove = 3,
    BalanceBelow = 4,
    OracleFlag = 5,
}

impl ConditionKind {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::PriceBelow),
            1 => Some(Self::PriceAbove),
            2 => Some(Self::TimeWindow),
            3 => Some(Self::BalanceAbove),
            4 => Some(Self::BalanceBelow),
            5 => Some(Self::OracleFlag),
            _ => None,
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }
}

/// How a set of conditions is combined.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConditionCombinator {
    /// Every condition must hold (AND).
    All,
    /// At least one condition must hold (OR).
    Any,
}

impl ConditionCombinator {
    pub fn from_code(code: u8) -> Self {
        if code == 1 {
            Self::Any
        } else {
            Self::All
        }
    }

    pub fn code(self) -> u8 {
        match self {
            Self::All => 0,
            Self::Any => 1,
        }
    }
}

/// A single trigger predicate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Condition {
    pub kind: ConditionKind,
    /// Comparison value for price/balance kinds.
    pub threshold: u64,
    /// Inclusive lower bound for `TimeWindow`.
    pub window_start: i64,
    /// Inclusive upper bound for `TimeWindow`.
    pub window_end: i64,
    /// Invert the result of this condition.
    pub negate: bool,
}

/// The inputs available when evaluating conditions. Missing inputs make the
/// dependent kinds evaluate to `false` (unmet) — fail-safe.
#[derive(Debug, Clone, Copy, Default)]
pub struct ConditionContext {
    pub now: i64,
    pub available_usd: Option<u64>,
    pub feed_price: Option<u64>,
    pub oracle_flag: bool,
}

fn condition_met(condition: &Condition, ctx: &ConditionContext) -> bool {
    let raw = match condition.kind {
        ConditionKind::PriceBelow => ctx.feed_price.is_some_and(|p| p <= condition.threshold),
        ConditionKind::PriceAbove => ctx.feed_price.is_some_and(|p| p >= condition.threshold),
        ConditionKind::TimeWindow => {
            ctx.now >= condition.window_start && ctx.now <= condition.window_end
        }
        ConditionKind::BalanceAbove => ctx.available_usd.is_some_and(|b| b >= condition.threshold),
        ConditionKind::BalanceBelow => ctx.available_usd.is_some_and(|b| b <= condition.threshold),
        ConditionKind::OracleFlag => ctx.oracle_flag,
    };
    raw ^ condition.negate
}

/// Returns whether `conditions` are satisfied under `combinator`. An empty set
/// is trivially satisfied.
pub fn evaluate_conditions(
    ctx: &ConditionContext,
    conditions: &[Condition],
    combinator: ConditionCombinator,
) -> bool {
    if conditions.is_empty() {
        return true;
    }
    match combinator {
        ConditionCombinator::All => conditions.iter().all(|c| condition_met(c, ctx)),
        ConditionCombinator::Any => conditions.iter().any(|c| condition_met(c, ctx)),
    }
}
