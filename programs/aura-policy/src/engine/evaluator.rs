use crate::{
    config::PolicyConfig,
    context::{PolicyEvaluationContext, TransactionContext},
    decision::{PolicyDecision, RuleOutcome},
    helpers::{
        active_hourly_limit, normalize_state, protocol_allowed, push_recent_amount, slippage_bps,
    },
    state::PolicyState,
    types::Chain,
    violations::ViolationCode,
};

/// Evaluates all policy rules against `context` and returns a `PolicyDecision`.
///
/// Rules are evaluated in order and short-circuit on the first failure —
/// the returned `violation` identifies which rule failed. If all rules pass,
/// `approved` is `true` and `next_state` contains the updated spending counters
/// ready to be committed by `finalize_signed_pending`.
///
/// Rules evaluated (in order):
/// 1. `per_tx_limit`          — amount ≤ `per_tx_limit_usd`
/// 2. `daily_limit`           — projected daily spend ≤ effective daily limit
/// 3. `bitcoin_manual_review` — Bitcoin amounts below threshold
/// 4. `time_window_limit`     — projected hourly spend ≤ active hourly limit
/// 5. `protocol_whitelist`    — protocol ID present in `allowed_protocol_bitmap`
/// 6. `slippage_limit`        — computed slippage ≤ `max_slippage_bps`
/// 7. `quote_freshness`       — quote age ≤ `max_quote_age_secs`
/// 8. `counterparty_risk`     — risk score ≤ `max_counterparty_risk_score`
/// 9. `shared_pool_limit`     — projected swarm spend ≤ `shared_pool_limit_usd`
/// 10. `velocity_limit`       — recent-amounts window sum ≤ `velocity_limit_usd`
pub fn evaluate_transaction(
    config: &PolicyConfig,
    previous_state: &PolicyState,
    context: &PolicyEvaluationContext,
) -> PolicyDecision {
    let tx = &context.transaction;
    let mut state = normalize_state(previous_state, tx.current_timestamp);
    let effective_daily_limit_usd = config.effective_daily_limit_usd(context.reputation_score);
    let mut trace = Vec::new();

    if tx.amount_usd > config.per_tx_limit_usd {
        trace.push(RuleOutcome::failed(
            "per_tx_limit",
            format!("{} > {}", tx.amount_usd, config.per_tx_limit_usd),
        ));
        return deny(
            state,
            ViolationCode::PerTransactionLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "per_tx_limit",
        "within per-transaction limit",
    ));

    let projected_daily_spend = state.spent_today_usd.saturating_add(tx.amount_usd);
    if projected_daily_spend > effective_daily_limit_usd {
        trace.push(RuleOutcome::failed(
            "daily_limit",
            format!("{projected_daily_spend} > {effective_daily_limit_usd}"),
        ));
        return deny(
            state,
            ViolationCode::DailyLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "daily_limit",
        format!("projected {projected_daily_spend} <= {effective_daily_limit_usd}"),
    ));

    if tx.target_chain == Chain::Bitcoin
        && tx.amount_usd > config.bitcoin_manual_review_threshold_usd
    {
        trace.push(RuleOutcome::failed(
            "bitcoin_manual_review",
            format!(
                "{} > {}",
                tx.amount_usd, config.bitcoin_manual_review_threshold_usd
            ),
        ));
        return deny(
            state,
            ViolationCode::BitcoinManualReview,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "bitcoin_manual_review",
        "manual review threshold not triggered",
    ));

    let projected_hourly_spend = state.hourly_spent_usd.saturating_add(tx.amount_usd);
    let active_hour_limit = active_hourly_limit(config, tx.current_timestamp);
    if projected_hourly_spend > active_hour_limit {
        trace.push(RuleOutcome::failed(
            "time_window_limit",
            format!("{projected_hourly_spend} > {active_hour_limit}"),
        ));
        return deny(
            state,
            ViolationCode::TimeWindowLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "time_window_limit",
        format!("projected {projected_hourly_spend} <= {active_hour_limit}"),
    ));

    if let Some(protocol_id) = tx.protocol_id {
        if !protocol_allowed(config.allowed_protocol_bitmap, protocol_id) {
            trace.push(RuleOutcome::failed(
                "protocol_whitelist",
                format!("protocol {protocol_id} not present in whitelist bitmap"),
            ));
            return deny(
                state,
                ViolationCode::ProtocolNotAllowed,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "protocol_whitelist",
            format!("protocol {protocol_id} allowed"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "protocol_whitelist",
            "protocol-specific check not required",
        ));
    }

    if let (Some(expected), Some(actual)) = (tx.expected_output_usd, tx.actual_output_usd) {
        let computed_slippage_bps = slippage_bps(expected, actual);
        if computed_slippage_bps > config.max_slippage_bps {
            trace.push(RuleOutcome::failed(
                "slippage_limit",
                format!("{computed_slippage_bps} > {}", config.max_slippage_bps),
            ));
            return deny(
                state,
                ViolationCode::SlippageExceeded,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "slippage_limit",
            format!("{computed_slippage_bps} <= {}", config.max_slippage_bps),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "slippage_limit",
            "slippage check not required",
        ));
    }

    if let (Some(max_quote_age_secs), Some(quote_age_secs)) =
        (config.max_quote_age_secs, tx.quote_age_secs)
    {
        if quote_age_secs > max_quote_age_secs {
            trace.push(RuleOutcome::failed(
                "quote_freshness",
                format!("{quote_age_secs}s > {max_quote_age_secs}s"),
            ));
            return deny(
                state,
                ViolationCode::QuoteStale,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "quote_freshness",
            format!("{quote_age_secs}s <= {max_quote_age_secs}s"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "quote_freshness",
            "quote freshness check not required",
        ));
    }

    if let (Some(max_counterparty_risk_score), Some(counterparty_risk_score)) = (
        config.max_counterparty_risk_score,
        tx.counterparty_risk_score,
    ) {
        if counterparty_risk_score > max_counterparty_risk_score {
            trace.push(RuleOutcome::failed(
                "counterparty_risk",
                format!("{counterparty_risk_score} > {max_counterparty_risk_score}"),
            ));
            return deny(
                state,
                ViolationCode::CounterpartyRisk,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "counterparty_risk",
            format!("{counterparty_risk_score} <= {max_counterparty_risk_score}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "counterparty_risk",
            "counterparty risk telemetry not required",
        ));
    }

    if let (Some(shared_pool_limit_usd), Some(shared_spent_usd)) =
        (config.shared_pool_limit_usd, context.shared_spent_usd)
    {
        let projected_shared_spend = shared_spent_usd.saturating_add(tx.amount_usd);
        if projected_shared_spend > shared_pool_limit_usd {
            trace.push(RuleOutcome::failed(
                "shared_pool_limit",
                format!("{projected_shared_spend} > {shared_pool_limit_usd}"),
            ));
            return deny(
                state,
                ViolationCode::SharedPoolLimit,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "shared_pool_limit",
            format!("{projected_shared_spend} <= {shared_pool_limit_usd}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "shared_pool_limit",
            "shared pool policy not enabled",
        ));
    }

    let recent_total: u64 = state.recent_amounts.iter().copied().sum();
    let projected_velocity = recent_total.saturating_add(tx.amount_usd);
    if projected_velocity > config.velocity_limit_usd {
        trace.push(RuleOutcome::failed(
            "velocity_limit",
            format!("{projected_velocity} > {}", config.velocity_limit_usd),
        ));
        return deny(
            state,
            ViolationCode::VelocityLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "velocity_limit",
        format!("{projected_velocity} <= {}", config.velocity_limit_usd),
    ));

    state.spent_today_usd = projected_daily_spend;
    state.hourly_spent_usd = projected_hourly_spend;
    push_recent_amount(&mut state, tx.amount_usd);
    trace.push(RuleOutcome::passed(
        "state_commit",
        "policy counters updated for approved transaction",
    ));

    PolicyDecision {
        approved: true,
        violation: ViolationCode::None,
        next_state: state,
        effective_daily_limit_usd,
        trace,
    }
}

/// Runs the public subset of policy rules for a confidential proposal.
///
/// Used before submitting an FHE graph execution. The per-transaction and
/// daily-limit checks are intentionally omitted — those are evaluated
/// over encrypted values by the Encrypt network. All other rules (Bitcoin
/// threshold, time window, protocol whitelist, slippage, quote freshness,
/// counterparty risk, shared pool, velocity) run publicly.
///
/// If this pre-check denies, the proposal is rejected immediately without
/// invoking the FHE graph. If it passes, the proposal proceeds to FHE
/// evaluation and the `confidential_spend_guardrails` note is added to the trace.
pub fn evaluate_public_precheck(
    config: &PolicyConfig,
    previous_state: &PolicyState,
    context: &PolicyEvaluationContext,
) -> PolicyDecision {
    let tx = &context.transaction;
    let mut state = normalize_state(previous_state, tx.current_timestamp);
    let effective_daily_limit_usd = config.effective_daily_limit_usd(context.reputation_score);
    let mut trace = Vec::new();

    if tx.target_chain == Chain::Bitcoin
        && tx.amount_usd > config.bitcoin_manual_review_threshold_usd
    {
        trace.push(RuleOutcome::failed(
            "bitcoin_manual_review",
            format!(
                "{} > {}",
                tx.amount_usd, config.bitcoin_manual_review_threshold_usd
            ),
        ));
        return deny(
            state,
            ViolationCode::BitcoinManualReview,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "bitcoin_manual_review",
        "manual review threshold not triggered",
    ));

    let projected_hourly_spend = state.hourly_spent_usd.saturating_add(tx.amount_usd);
    let active_hour_limit = active_hourly_limit(config, tx.current_timestamp);
    if projected_hourly_spend > active_hour_limit {
        trace.push(RuleOutcome::failed(
            "time_window_limit",
            format!("{projected_hourly_spend} > {active_hour_limit}"),
        ));
        return deny(
            state,
            ViolationCode::TimeWindowLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "time_window_limit",
        format!("projected {projected_hourly_spend} <= {active_hour_limit}"),
    ));

    if let Some(protocol_id) = tx.protocol_id {
        if !protocol_allowed(config.allowed_protocol_bitmap, protocol_id) {
            trace.push(RuleOutcome::failed(
                "protocol_whitelist",
                format!("protocol {protocol_id} not present in whitelist bitmap"),
            ));
            return deny(
                state,
                ViolationCode::ProtocolNotAllowed,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "protocol_whitelist",
            format!("protocol {protocol_id} allowed"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "protocol_whitelist",
            "protocol-specific check not required",
        ));
    }

    if let (Some(expected), Some(actual)) = (tx.expected_output_usd, tx.actual_output_usd) {
        let computed_slippage_bps = slippage_bps(expected, actual);
        if computed_slippage_bps > config.max_slippage_bps {
            trace.push(RuleOutcome::failed(
                "slippage_limit",
                format!("{computed_slippage_bps} > {}", config.max_slippage_bps),
            ));
            return deny(
                state,
                ViolationCode::SlippageExceeded,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "slippage_limit",
            format!("{computed_slippage_bps} <= {}", config.max_slippage_bps),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "slippage_limit",
            "slippage check not required",
        ));
    }

    if let (Some(max_quote_age_secs), Some(quote_age_secs)) =
        (config.max_quote_age_secs, tx.quote_age_secs)
    {
        if quote_age_secs > max_quote_age_secs {
            trace.push(RuleOutcome::failed(
                "quote_freshness",
                format!("{quote_age_secs}s > {max_quote_age_secs}s"),
            ));
            return deny(
                state,
                ViolationCode::QuoteStale,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "quote_freshness",
            format!("{quote_age_secs}s <= {max_quote_age_secs}s"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "quote_freshness",
            "quote freshness check not required",
        ));
    }

    if let (Some(max_counterparty_risk_score), Some(counterparty_risk_score)) = (
        config.max_counterparty_risk_score,
        tx.counterparty_risk_score,
    ) {
        if counterparty_risk_score > max_counterparty_risk_score {
            trace.push(RuleOutcome::failed(
                "counterparty_risk",
                format!("{counterparty_risk_score} > {max_counterparty_risk_score}"),
            ));
            return deny(
                state,
                ViolationCode::CounterpartyRisk,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "counterparty_risk",
            format!("{counterparty_risk_score} <= {max_counterparty_risk_score}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "counterparty_risk",
            "counterparty risk telemetry not required",
        ));
    }

    if let (Some(shared_pool_limit_usd), Some(shared_spent_usd)) =
        (config.shared_pool_limit_usd, context.shared_spent_usd)
    {
        let projected_shared_spend = shared_spent_usd.saturating_add(tx.amount_usd);
        if projected_shared_spend > shared_pool_limit_usd {
            trace.push(RuleOutcome::failed(
                "shared_pool_limit",
                format!("{projected_shared_spend} > {shared_pool_limit_usd}"),
            ));
            return deny(
                state,
                ViolationCode::SharedPoolLimit,
                effective_daily_limit_usd,
                trace,
            );
        }

        trace.push(RuleOutcome::passed(
            "shared_pool_limit",
            format!("{projected_shared_spend} <= {shared_pool_limit_usd}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "shared_pool_limit",
            "shared pool policy not enabled",
        ));
    }

    let recent_total: u64 = state.recent_amounts.iter().copied().sum();
    let projected_velocity = recent_total.saturating_add(tx.amount_usd);
    if projected_velocity > config.velocity_limit_usd {
        trace.push(RuleOutcome::failed(
            "velocity_limit",
            format!("{projected_velocity} > {}", config.velocity_limit_usd),
        ));
        return deny(
            state,
            ViolationCode::VelocityLimit,
            effective_daily_limit_usd,
            trace,
        );
    }
    trace.push(RuleOutcome::passed(
        "velocity_limit",
        format!("{projected_velocity} <= {}", config.velocity_limit_usd),
    ));

    trace.push(RuleOutcome::passed(
        "confidential_spend_guardrails",
        "encrypted per-transaction and daily-limit checks deferred to Encrypt",
    ));

    state.hourly_spent_usd = projected_hourly_spend;
    push_recent_amount(&mut state, tx.amount_usd);
    trace.push(RuleOutcome::passed(
        "state_commit",
        "public counters updated; encrypted spend counters are updated by Encrypt",
    ));

    PolicyDecision {
        approved: true,
        violation: ViolationCode::None,
        next_state: state,
        effective_daily_limit_usd,
        trace,
    }
}

/// Convenience wrapper around `evaluate_transaction` for tests and off-chain tooling.
///
/// Wraps `tx` in a `PolicyEvaluationContext` with no reputation score and no
/// swarm spend, then delegates to `evaluate_transaction`.
#[allow(clippy::needless_pass_by_value)]
pub fn evaluate_transaction_simple(
    config: &PolicyConfig,
    previous_state: &PolicyState,
    tx: TransactionContext,
) -> PolicyDecision {
    evaluate_transaction(config, previous_state, &PolicyEvaluationContext::from(tx))
}

/// Constructs a denial `PolicyDecision` with the given violation and trace.
fn deny(
    state: PolicyState,
    violation: ViolationCode,
    effective_daily_limit_usd: u64,
    trace: Vec<RuleOutcome>,
) -> PolicyDecision {
    PolicyDecision {
        approved: false,
        violation,
        next_state: state,
        effective_daily_limit_usd,
        trace,
    }
}
