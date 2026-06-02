//! Tests for fee models, the effective-fee merge, accrual, and billing presets.

use anchor_lang::prelude::Pubkey;

use crate::{
    instructions::fee_vault::accrue_fee,
    program_accounts::{low_balance_mode, FeeVaultAccount},
    state::{
        build_billing_profile, BillingProfileKind, FeeContext, FeeSchedule, FeeScheduleInvariant,
        FeeTier, FeeTypeRate,
    },
};

const TRANSFER: u8 = 0;
const SWAP: u8 = 1;

fn ctx(amount_usd: u64, tx_type_code: u8, volume_usd: u64) -> FeeContext {
    FeeContext {
        amount_usd,
        tx_type_code,
        volume_usd,
        is_confidential: false,
        reputation_discount: false,
        referral_discount: false,
        protocol_floor_bps: 0,
    }
}

fn vault(fee_balance: u64, mode: u8) -> FeeVaultAccount {
    FeeVaultAccount {
        bump: 1,
        treasury: Pubkey::new_unique(),
        protocol_fee_recipient: Pubkey::new_unique(),
        accumulated_fees_lamports: 0,
        total_fees_collected_usd: 0,
        last_collection_at: 0,
        fee_count: 0,
        fee_balance,
        fee_debt_usd: 0,
        low_balance_mode: mode,
        splits: Vec::new(),
    }
}

#[test]
fn per_type_rates_differ_for_swap_and_transfer() {
    let schedule = FeeSchedule {
        base_bps: 10,
        per_type_bps: vec![
            FeeTypeRate {
                tx_type: TRANSFER,
                bps: 5,
            },
            FeeTypeRate {
                tx_type: SWAP,
                bps: 30,
            },
        ],
        ..FeeSchedule::default()
    };
    let transfer = schedule.transaction_fee(&ctx(100_000, TRANSFER, 0));
    let swap = schedule.transaction_fee(&ctx(100_000, SWAP, 0));
    assert_eq!(transfer, 50); // 5 bps
    assert_eq!(swap, 300); // 30 bps
    assert!(swap > transfer);
}

#[test]
fn tiered_rate_steps_down_after_volume_threshold() {
    let schedule = FeeSchedule {
        base_bps: 30,
        tiers: vec![FeeTier {
            threshold_usd: 1_000_000,
            bps: 10,
        }],
        ..FeeSchedule::default()
    };
    // Below the threshold uses the base rate; above uses the tier rate.
    assert_eq!(schedule.transaction_fee(&ctx(10_000, TRANSFER, 0)), 30); // 30 bps
    assert_eq!(
        schedule.transaction_fee(&ctx(10_000, TRANSFER, 2_000_000)),
        10
    ); // 10 bps
}

#[test]
fn min_and_max_clamps_apply() {
    let schedule = FeeSchedule {
        base_bps: 10,
        min_fee_usd: 5,
        max_fee_usd: Some(100),
        ..FeeSchedule::default()
    };
    // Dust transfer hits the min floor (10 bps of 100 = 0 → 5).
    assert_eq!(schedule.transaction_fee(&ctx(100, TRANSFER, 0)), 5);
    // Whale transfer is capped (10 bps of 10M = 10_000 → 100).
    assert_eq!(schedule.transaction_fee(&ctx(10_000_000, TRANSFER, 0)), 100);
}

#[test]
fn fhe_subsidy_and_protocol_floor() {
    let schedule = FeeSchedule {
        base_bps: 100,
        fhe_subsidy_bps: 5_000, // 50% discount
        discount_cap_bps: 5_000,
        ..FeeSchedule::default()
    };
    let mut context = ctx(10_000, TRANSFER, 0);
    context.is_confidential = true;
    // 100 bps of 10_000 = 100, halved by the subsidy = 50.
    assert_eq!(schedule.transaction_fee(&context), 50);

    // With a 60 bps protocol floor, the discounted fee cannot drop below 60.
    context.protocol_floor_bps = 60;
    assert_eq!(schedule.transaction_fee(&context), 60);
}

#[test]
fn owner_zeroed_schedule_still_pays_protocol_floor() {
    let schedule = FeeSchedule {
        base_bps: 0,
        ..FeeSchedule::default()
    };
    let mut context = ctx(10_000, TRANSFER, 0);
    context.protocol_floor_bps = 10;
    assert_eq!(schedule.transaction_fee(&context), 10);
}

#[test]
fn schedule_validation_catches_incoherence() {
    let mut schedule = FeeSchedule::default();
    schedule.min_fee_usd = 100;
    schedule.max_fee_usd = Some(10);
    assert_eq!(
        schedule.validate(),
        Err(FeeScheduleInvariant::MinExceedsMax)
    );

    let mut schedule = FeeSchedule::default();
    schedule.tiers = vec![
        FeeTier {
            threshold_usd: 100,
            bps: 10,
        },
        FeeTier {
            threshold_usd: 100,
            bps: 5,
        },
    ];
    assert_eq!(
        schedule.validate(),
        Err(FeeScheduleInvariant::TiersNotMonotonic)
    );

    let mut schedule = FeeSchedule::default();
    schedule.fhe_subsidy_bps = 5_000;
    schedule.discount_cap_bps = 1_000;
    assert_eq!(
        schedule.validate(),
        Err(FeeScheduleInvariant::DiscountExceedsCap)
    );
}

#[test]
fn accrue_debits_prepaid_into_accrued() {
    let mut v = vault(1_000, low_balance_mode::BLOCK);
    accrue_fee(&mut v, 200).unwrap();
    assert_eq!(v.fee_balance, 800);
    assert_eq!(v.accumulated_fees_lamports, 200);
    assert_eq!(v.fee_debt_usd, 0);
}

#[test]
fn accrue_block_refuses_when_short() {
    let mut v = vault(100, low_balance_mode::BLOCK);
    assert!(accrue_fee(&mut v, 200).is_err());
}

#[test]
fn accrue_degrade_records_debt() {
    let mut v = vault(50, low_balance_mode::DEGRADE);
    accrue_fee(&mut v, 200).unwrap();
    assert_eq!(v.fee_balance, 0);
    assert_eq!(v.accumulated_fees_lamports, 50);
    assert_eq!(v.fee_debt_usd, 150);
}

#[test]
fn billing_presets_are_coherent_and_shaped() {
    for code in 1u8..=7 {
        let kind = BillingProfileKind::from_code(code).unwrap();
        let schedule = build_billing_profile(kind);
        assert!(schedule.validate().is_ok(), "preset {code} incoherent");
    }
    // Payroll: subscription + dust floor, ~0 per-tx on transfers.
    let payroll = build_billing_profile(BillingProfileKind::Payroll);
    assert_eq!(payroll.subscription_usd_per_period, 50);
    assert_eq!(payroll.min_fee_usd, 1);
    assert_eq!(payroll.transaction_fee(&ctx(10_000, TRANSFER, 0)), 1);
    // TradingDesk: swap bps + tiers.
    let desk = build_billing_profile(BillingProfileKind::TradingDesk);
    assert!(!desk.tiers.is_empty());
    assert_eq!(desk.transaction_fee(&ctx(10_000, SWAP, 0)), 30); // 30 bps
}
