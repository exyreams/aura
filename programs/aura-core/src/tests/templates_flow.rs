//! Tests for doc 03 — policy templates (record + parameterization surface).
//!
//! The CRUD/apply instruction wrappers operate on a standalone `PolicyTemplate`
//! PDA and are verified by compilation + account constraints + the on-chain
//! smoke bin; the record round-trip, fork-from-preset equivalence, and
//! parameterized scaling are exercised here.

use aura_policy::{build_policy_preset, validate_policy_config, PolicyConfig, PolicyPresetKind};

use crate::instructions::policy_templates::scale_usd_limits;
use crate::program_accounts::PolicyConfigRecord;

#[test]
fn config_record_round_trips_every_preset() {
    for code in 1u8..=10 {
        let kind = PolicyPresetKind::from_code(code).expect("valid preset");
        let config = build_policy_preset(kind);
        let record = PolicyConfigRecord::from_domain(&config);
        let decoded = record.to_domain();
        assert_eq!(decoded, config, "preset {kind:?} did not round-trip");
        validate_policy_config(&decoded).expect("preset stays coherent through the record");
    }
}

#[test]
fn fork_from_preset_matches_apply_policy_preset() {
    // The template fork path encodes the preset via the same record, so a forked
    // template's config equals applying that preset directly.
    let kind = PolicyPresetKind::TradingDesk;
    let forked = PolicyConfigRecord::from_domain(&build_policy_preset(kind)).to_domain();
    assert_eq!(forked, build_policy_preset(kind));
}

#[test]
fn parameterized_scaling_scales_limits_and_stays_coherent() {
    let mut config = build_policy_preset(PolicyPresetKind::HighTrustExecutor);
    let base_per_tx = config.per_tx_limit_usd;
    let base_daily = config.daily_limit_usd;
    let base_weekly = config.weekly_limit_usd;

    // Halve every USD limit.
    scale_usd_limits(&mut config, 5_000);
    assert_eq!(config.per_tx_limit_usd, base_per_tx / 2);
    assert_eq!(config.daily_limit_usd, base_daily / 2);
    assert_eq!(config.weekly_limit_usd, base_weekly.map(|w| w / 2));
    // Scaling uniformly preserves coherence.
    validate_policy_config(&config).expect("scaled config remains coherent");
}

#[test]
fn unscaled_factor_is_identity() {
    let mut config = PolicyConfig::default();
    let original = config.clone();
    scale_usd_limits(&mut config, 10_000);
    assert_eq!(config, original);
}
