/// The result of evaluating a single policy rule.
///
/// Each rule appended to `PolicyDecision::trace` produces one `RuleOutcome`.
/// The `rule_name` is a `&'static str` so it can be stored without allocation
/// during evaluation; it is leaked to `'static` when deserialized from the
/// on-chain account (see `leak_rule_name` in `program_accounts`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RuleOutcome {
    /// Short snake_case identifier for the rule (e.g. `"daily_limit"`).
    pub rule_name: &'static str,
    /// Whether the rule passed.
    pub passed: bool,
    /// Human-readable detail string, typically showing the compared values.
    pub detail: String,
}

impl RuleOutcome {
    /// Constructs a passing outcome for `rule_name`.
    pub fn passed(rule_name: &'static str, detail: impl Into<String>) -> Self {
        Self {
            rule_name,
            passed: true,
            detail: detail.into(),
        }
    }

    /// Constructs a failing outcome for `rule_name`.
    pub fn failed(rule_name: &'static str, detail: impl Into<String>) -> Self {
        Self {
            rule_name,
            passed: false,
            detail: detail.into(),
        }
    }

    /// A softenable check that failed but was allowed under `CheckMode::Warn`.
    /// Counts as passed; the `[warn]` tag marks it as softened in the trace.
    pub fn warned(rule_name: &'static str, detail: impl Into<String>) -> Self {
        Self {
            rule_name,
            passed: true,
            detail: format!("[warn] {}", detail.into()),
        }
    }

    /// A softenable check allowed under `CheckMode::Degrade` (within the clamp).
    pub fn degraded(rule_name: &'static str, detail: impl Into<String>) -> Self {
        Self {
            rule_name,
            passed: true,
            detail: format!("[degrade] {}", detail.into()),
        }
    }

    /// A softenable check bypassed under `CheckMode::Skip`.
    pub fn skipped(rule_name: &'static str, detail: impl Into<String>) -> Self {
        Self {
            rule_name,
            passed: true,
            detail: format!("[skip] {}", detail.into()),
        }
    }
}
