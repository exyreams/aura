//! Per-transaction and daily spend limit smoke scenarios.

use super::{harness::*, prelude::*};

/// [1] Per-transaction limit — deny (amount 800 > per_tx_limit 500)
pub(super) async fn scenario_per_tx_deny(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[1] Per-tx limit — DENY");
    let agent_id = format!("pol-pertx-deny-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            per_tx_limit_usd: 500,
            daily_limit_usd: 10_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        500,
        0,
        800,
        created_at,
        0,
    )
    .await?;
    let pending = domain.pending.context("[1] no pending")?;
    ensure!(!pending.decision.approved, "[1] should be denied");
    println!("  ✓ denied — violation={}", pending.decision.violation);
    execute_denied(rpc, payer, treasury, created_at + 20)
}

/// [2] Per-transaction limit — approve + finalize (amount 250 < per_tx_limit 500)
pub(super) async fn scenario_per_tx_approve(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[2] Per-tx limit — APPROVE + finalize");
    let agent_id = format!("pol-pertx-approve-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            per_tx_limit_usd: 500,
            daily_limit_usd: 10_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        500,
        0,
        250,
        created_at,
        2,
    )
    .await?;
    let pending = domain.pending.context("[2] no pending")?;
    ensure!(pending.decision.approved, "[2] should be approved");
    println!("  ✓ approved");

    let mut dw = connect_dwallet_client().await?;
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 20,
    )
    .await
}

/// [3] Daily limit — deny (spent_today 800 + amount 400 > daily_limit 1 000)
pub(super) async fn scenario_daily_deny(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[3] Daily limit — DENY");
    let agent_id = format!("pol-daily-deny-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 1_000,
            per_tx_limit_usd: 5_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        1_000,
        5_000,
        800,
        400,
        created_at,
        0,
    )
    .await?;
    let pending = domain.pending.context("[3] no pending")?;
    ensure!(!pending.decision.approved, "[3] should be denied");
    println!("  ✓ denied — violation={}", pending.decision.violation);
    execute_denied(rpc, payer, treasury, created_at + 20)
}

/// [4] Daily limit — approve + finalize (spent_today 200 + amount 300 < daily_limit 1 000)
pub(super) async fn scenario_daily_approve(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[4] Daily limit — APPROVE + finalize");
    let agent_id = format!("pol-daily-approve-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 1_000,
            per_tx_limit_usd: 5_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        1_000,
        5_000,
        200,
        300,
        created_at,
        2,
    )
    .await?;
    let pending = domain.pending.context("[4] no pending")?;
    ensure!(pending.decision.approved, "[4] should be approved");
    println!("  ✓ approved");

    let mut dw = connect_dwallet_client().await?;
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 20,
    )
    .await
}
