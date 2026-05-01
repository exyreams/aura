use crate::{
    config::{required_approval_level, AnomalyAction, ApprovalLevel, PolicyConfig},
    context::{PolicyEvaluationContext, TransactionContext},
    decision::{PolicyDecision, RiskFactor, RuleOutcome},
    helpers::{
        active_hourly_limit, address_hash, compute_stats_integer, normalize_state,
        protocol_allowed, push_recent_amount, slippage_bps, z_score_bps,
    },
    state::{PolicyState, RecipientSpendRecord},
    types::Chain,
    violations::ViolationCode,
};

pub const REG_FLAG_CTR_THRESHOLD: u8 = 0b0000_0001;
pub const REG_FLAG_CROSS_BORDER: u8 = 0b0000_0010;
pub const REG_FLAG_HIGH_RISK_COUNTERPARTY: u8 = 0b0000_0100;
pub const REG_FLAG_REQUIRES_KYC: u8 = 0b0000_1000;

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
    let (risk_score, risk_factors) = compute_risk_score(tx, config, &state);
    let regulatory_flags = compute_regulatory_flags(tx);
    let mut trace = Vec::new();

    if config.scoped_pause.transaction_paused(tx) {
        trace.push(RuleOutcome::failed(
            "scoped_pause",
            "transaction matches an active scoped pause",
        ));
        return deny(
            state,
            ViolationCode::ExecutionScopePaused,
            effective_daily_limit_usd,
            trace,
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed("scoped_pause", "scope is not paused"));

    if let Err(violation) = config.budget_envelopes.check(tx) {
        trace.push(RuleOutcome::failed(
            "budget_envelope",
            violation.to_string(),
        ));
        return deny(
            state,
            violation,
            effective_daily_limit_usd,
            trace,
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed(
        "budget_envelope",
        "scoped budgets available",
    ));

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
            risk_score,
            risk_factors,
            regulatory_flags,
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
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed(
        "daily_limit",
        format!("projected {projected_daily_spend} <= {effective_daily_limit_usd}"),
    ));

    if let Some(weekly_limit_usd) = config.weekly_limit_usd {
        let projected_weekly = state.seven_day_total().saturating_add(tx.amount_usd);
        if projected_weekly > weekly_limit_usd {
            trace.push(RuleOutcome::failed(
                "weekly_limit",
                format!("{projected_weekly} > {weekly_limit_usd}"),
            ));
            return deny(
                state,
                ViolationCode::WeeklyLimit,
                effective_daily_limit_usd,
                trace,
                risk_score,
                risk_factors,
                regulatory_flags,
            );
        }
        trace.push(RuleOutcome::passed(
            "weekly_limit",
            format!("{projected_weekly} <= {weekly_limit_usd}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "weekly_limit",
            "weekly limit not enabled",
        ));
    }

    if let Some(monthly_limit_usd) = config.monthly_limit_usd {
        let projected_monthly = state.thirty_day_spent_usd.saturating_add(tx.amount_usd);
        if projected_monthly > monthly_limit_usd {
            trace.push(RuleOutcome::failed(
                "monthly_limit",
                format!("{projected_monthly} > {monthly_limit_usd}"),
            ));
            return deny(
                state,
                ViolationCode::MonthlyLimit,
                effective_daily_limit_usd,
                trace,
                risk_score,
                risk_factors,
                regulatory_flags,
            );
        }
        trace.push(RuleOutcome::passed(
            "monthly_limit",
            format!("{projected_monthly} <= {monthly_limit_usd}"),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "monthly_limit",
            "monthly limit not enabled",
        ));
    }

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
            risk_score,
            risk_factors,
            regulatory_flags,
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
            risk_score,
            risk_factors,
            regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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

    if let Some(recipient) = tx.recipient_or_contract.as_ref() {
        if let Some(limit) = config
            .recipient_limits
            .iter()
            .find(|limit| limit.chain == tx.target_chain && limit.address == *recipient)
        {
            if let Some(per_tx_limit_usd) = limit.per_tx_limit_usd {
                if tx.amount_usd > per_tx_limit_usd {
                    trace.push(RuleOutcome::failed(
                        "recipient_per_tx_limit",
                        format!("{} > {}", tx.amount_usd, per_tx_limit_usd),
                    ));
                    return deny(
                        state,
                        ViolationCode::RecipientPerTransactionLimit,
                        effective_daily_limit_usd,
                        trace,
                        risk_score,
                        risk_factors,
                        regulatory_flags,
                    );
                }
            }

            let hash = address_hash(recipient);
            let spent = state
                .recipient_spend
                .iter()
                .find(|record| {
                    record.chain_code == chain_code(tx.target_chain) && record.address_hash == hash
                })
                .map_or(0, |record| record.spent_today_usd);
            let projected = spent.saturating_add(tx.amount_usd);
            if projected > limit.daily_limit_usd {
                trace.push(RuleOutcome::failed(
                    "recipient_daily_limit",
                    format!("{projected} > {}", limit.daily_limit_usd),
                ));
                return deny(
                    state,
                    ViolationCode::RecipientDailyLimit,
                    effective_daily_limit_usd,
                    trace,
                    risk_score,
                    risk_factors,
                    regulatory_flags,
                );
            }
            trace.push(RuleOutcome::passed(
                "recipient_limit",
                format!("{projected} <= {}", limit.daily_limit_usd),
            ));
        } else {
            trace.push(RuleOutcome::passed(
                "recipient_limit",
                "recipient-specific policy not configured",
            ));
        }
    } else {
        trace.push(RuleOutcome::passed(
            "recipient_limit",
            "recipient address not supplied",
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
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed(
        "velocity_limit",
        format!("{projected_velocity} <= {}", config.velocity_limit_usd),
    ));

    let mut risk_score = risk_score;
    let mut risk_factors = risk_factors;
    if let Some(anomaly_cfg) = config.anomaly_config {
        if anomaly_cfg.enabled && state.recent_amounts.len() >= anomaly_cfg.min_sample_size {
            let (mean, std_dev) = compute_stats_integer(&state.recent_amounts);
            let z_score = z_score_bps(tx.amount_usd, mean, std_dev);
            if z_score > anomaly_cfg.z_score_threshold_bps {
                risk_score = risk_score.max(85);
                risk_factors.push(RiskFactor {
                    name: "anomaly_detection".to_string(),
                    contribution: 25,
                    detail: format!(
                        "z-score {}bps > {}bps (mean={}, std_dev={})",
                        z_score, anomaly_cfg.z_score_threshold_bps, mean, std_dev
                    ),
                });
                trace.push(RuleOutcome::failed(
                    "anomaly_detection",
                    format!(
                        "z-score {}bps > {}bps",
                        z_score, anomaly_cfg.z_score_threshold_bps
                    ),
                ));
                if anomaly_cfg.action == AnomalyAction::Deny {
                    return deny(
                        state,
                        ViolationCode::AnomalyDetected,
                        effective_daily_limit_usd,
                        trace,
                        risk_score,
                        risk_factors,
                        regulatory_flags,
                    );
                }
            } else {
                trace.push(RuleOutcome::passed(
                    "anomaly_detection",
                    format!("z-score {z_score}bps within threshold"),
                ));
            }
        } else {
            trace.push(RuleOutcome::passed(
                "anomaly_detection",
                "anomaly detection not enabled or insufficient history",
            ));
        }
    } else {
        trace.push(RuleOutcome::passed(
            "anomaly_detection",
            "anomaly detection not enabled",
        ));
    }

    if let Some(ladder) = config.approval_ladder {
        let level = required_approval_level(&ladder, tx.amount_usd, u16::from(risk_score) * 100);
        if level == ApprovalLevel::Deny {
            trace.push(RuleOutcome::failed(
                "approval_ladder",
                "amount or risk score is above deny threshold",
            ));
            return deny(
                state,
                ViolationCode::ApprovalLadderDenied,
                effective_daily_limit_usd,
                trace,
                risk_score,
                risk_factors,
                regulatory_flags,
            );
        }
        trace.push(RuleOutcome::passed(
            "approval_ladder",
            format!("required level {}", level.code()),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "approval_ladder",
            "approval ladder not enabled",
        ));
    }

    state.spent_today_usd = projected_daily_spend;
    state.hourly_spent_usd = projected_hourly_spend;
    state.record_spend(tx.amount_usd);
    if let Some(recipient) = tx.recipient_or_contract.as_ref() {
        record_recipient_spend(
            &mut state,
            tx.target_chain,
            recipient,
            tx.amount_usd,
            tx.current_timestamp,
        );
    }
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
        risk_score,
        risk_factors,
        regulatory_flags,
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
    let (risk_score, risk_factors) = compute_risk_score(tx, config, &state);
    let regulatory_flags = compute_regulatory_flags(tx);
    let mut trace = Vec::new();

    if config.scoped_pause.transaction_paused(tx) {
        trace.push(RuleOutcome::failed(
            "scoped_pause",
            "transaction matches an active scoped pause",
        ));
        return deny(
            state,
            ViolationCode::ExecutionScopePaused,
            effective_daily_limit_usd,
            trace,
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed("scoped_pause", "scope is not paused"));

    if let Err(violation) = config.budget_envelopes.check(tx) {
        trace.push(RuleOutcome::failed(
            "budget_envelope",
            violation.to_string(),
        ));
        return deny(
            state,
            violation,
            effective_daily_limit_usd,
            trace,
            risk_score,
            risk_factors,
            regulatory_flags,
        );
    }
    trace.push(RuleOutcome::passed(
        "budget_envelope",
        "scoped budgets available",
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
            risk_score,
            risk_factors,
            regulatory_flags,
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
            risk_score,
            risk_factors,
            regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
                risk_score,
                risk_factors,
                regulatory_flags,
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
            risk_score,
            risk_factors,
            regulatory_flags,
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

    if let Some(ladder) = config.approval_ladder {
        let level = required_approval_level(&ladder, tx.amount_usd, u16::from(risk_score) * 100);
        if level == ApprovalLevel::Deny {
            trace.push(RuleOutcome::failed(
                "approval_ladder",
                "amount or risk score is above deny threshold",
            ));
            return deny(
                state,
                ViolationCode::ApprovalLadderDenied,
                effective_daily_limit_usd,
                trace,
                risk_score,
                risk_factors,
                regulatory_flags,
            );
        }
        trace.push(RuleOutcome::passed(
            "approval_ladder",
            format!("required level {}", level.code()),
        ));
    } else {
        trace.push(RuleOutcome::passed(
            "approval_ladder",
            "approval ladder not enabled",
        ));
    }

    state.hourly_spent_usd = projected_hourly_spend;
    state.record_spend(tx.amount_usd);
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
        risk_score,
        risk_factors,
        regulatory_flags,
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
    risk_score: u8,
    risk_factors: Vec<RiskFactor>,
    regulatory_flags: u8,
) -> PolicyDecision {
    PolicyDecision {
        approved: false,
        violation,
        next_state: state,
        effective_daily_limit_usd,
        risk_score,
        risk_factors,
        regulatory_flags,
        trace,
    }
}

fn record_recipient_spend(
    state: &mut PolicyState,
    chain: Chain,
    recipient: &str,
    amount_usd: u64,
    now: i64,
) {
    let chain_code = chain_code(chain);
    let hash = address_hash(recipient);
    if let Some(record) = state
        .recipient_spend
        .iter_mut()
        .find(|record| record.chain_code == chain_code && record.address_hash == hash)
    {
        record.spent_today_usd = record.spent_today_usd.saturating_add(amount_usd);
        record.last_reset_at = now;
        return;
    }

    state.recipient_spend.push(RecipientSpendRecord {
        chain_code,
        address_hash: hash,
        spent_today_usd: amount_usd,
        last_reset_at: now,
    });

    if state.recipient_spend.len() > 32 {
        let overflow = state.recipient_spend.len() - 32;
        state.recipient_spend.drain(0..overflow);
    }
}

fn compute_risk_score(
    tx: &TransactionContext,
    config: &PolicyConfig,
    state: &PolicyState,
) -> (u8, Vec<RiskFactor>) {
    let mut score = 0u16;
    let mut factors = Vec::new();

    let amount_pct = tx.amount_usd.saturating_mul(100) / config.per_tx_limit_usd.max(1);
    let amount_score = (amount_pct.saturating_mul(30) / 100).min(30) as u8;
    if amount_score > 0 {
        factors.push(RiskFactor {
            name: "amount_relative_to_limit".to_string(),
            contribution: amount_score,
            detail: format!("{amount_pct}% of per-transaction limit"),
        });
        score = score.saturating_add(u16::from(amount_score));
    }

    if let Some(counterparty_risk_score) = tx.counterparty_risk_score {
        let contribution = (u16::from(counterparty_risk_score) * 25 / 100) as u8;
        if contribution > 0 {
            factors.push(RiskFactor {
                name: "counterparty_risk".to_string(),
                contribution,
                detail: format!("score {counterparty_risk_score}"),
            });
            score = score.saturating_add(u16::from(contribution));
        }
    }

    if config.daily_limit_usd > 0 {
        let utilization_pct = state.spent_today_usd.saturating_mul(100) / config.daily_limit_usd;
        let contribution = (utilization_pct.saturating_mul(20) / 100).min(20) as u8;
        if contribution > 0 {
            factors.push(RiskFactor {
                name: "daily_utilization".to_string(),
                contribution,
                detail: format!("{utilization_pct}% of daily limit used"),
            });
            score = score.saturating_add(u16::from(contribution));
        }
    }

    if let (Some(max_age), Some(age)) = (config.max_quote_age_secs, tx.quote_age_secs) {
        let contribution = (age.saturating_mul(15) / max_age.max(1)).min(15) as u8;
        if contribution > 0 {
            factors.push(RiskFactor {
                name: "quote_staleness".to_string(),
                contribution,
                detail: format!("{age}s old"),
            });
            score = score.saturating_add(u16::from(contribution));
        }
    }

    if let (Some(expected), Some(actual)) = (tx.expected_output_usd, tx.actual_output_usd) {
        let slippage = slippage_bps(expected, actual);
        let contribution =
            (slippage.saturating_mul(10) / config.max_slippage_bps.max(1)).min(10) as u8;
        if contribution > 0 {
            factors.push(RiskFactor {
                name: "slippage".to_string(),
                contribution,
                detail: format!("{slippage}bps"),
            });
            score = score.saturating_add(u16::from(contribution));
        }
    }

    (score.min(100) as u8, factors)
}

pub fn compute_regulatory_flags(tx: &TransactionContext) -> u8 {
    let mut flags = 0u8;
    if tx.amount_usd >= 10_000 {
        flags |= REG_FLAG_CTR_THRESHOLD;
    }
    if tx.target_chain != Chain::Solana {
        flags |= REG_FLAG_CROSS_BORDER;
    }
    if tx.counterparty_risk_score.unwrap_or(0) >= 70 {
        flags |= REG_FLAG_HIGH_RISK_COUNTERPARTY | REG_FLAG_REQUIRES_KYC;
    }
    flags
}

fn chain_code(chain: Chain) -> u8 {
    match chain {
        Chain::Bitcoin => 0,
        Chain::Ethereum => 1,
        Chain::Solana => 2,
        Chain::Polygon => 3,
        Chain::Arbitrum => 4,
        Chain::Optimism => 5,
    }
}
