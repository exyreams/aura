//! Shared exposure and reputation policy smoke scenarios.

use super::{harness::*, prelude::*};

/// [8] Swarm shared-pool — first tx (200) approved, second (200) denied when pool full
pub(super) async fn scenario_swarm_pool(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[8] Swarm shared-pool limit");
    let agent_id = format!("pol-swarm-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 10_000,
            per_tx_limit_usd: 10_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            shared_pool_limit_usd: Some(300),
            ..Default::default()
        },
    )?;
    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureSwarm {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureSwarm {
                args: ConfigureSwarmArgs {
                    swarm_id: format!("swarm-{seed}"),
                    member_agents: vec![agent_id.clone()],
                    shared_pool_limit_usd: 300,
                    timestamp: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.swarm.is_some(),
        "[8] swarm not attached"
    );
    println!("  ✓ swarm configured (pool_limit=300)");

    // First tx: 200 USD — within pool
    let mut dw = connect_dwallet_client().await?;
    let d1 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        10_000,
        0,
        200,
        created_at,
        3,
    )
    .await?;
    ensure!(
        d1.pending.context("[8] no pending (1)")?.decision.approved,
        "[8] first tx should be approved"
    );
    println!("  ✓ first tx (200) approved");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 30,
        None,
        None,
    )
    .await?;
    println!("  ✓ finalized, pool spent=200");

    // Second tx: 200 USD — pool has 100 remaining, should deny
    let d2 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        10_000,
        0,
        200,
        created_at,
        40,
    )
    .await?;
    ensure!(
        !d2.pending.context("[8] no pending (2)")?.decision.approved,
        "[8] second tx should be denied"
    );
    println!("  ✓ second tx (200) denied — pool exhausted");
    execute_denied(rpc, payer, treasury, created_at + 80)
}

/// [11] Reputation scaling — amount 500 approved under reputation-adjusted limit
/// (raw per_tx=400, reputation 150 % → effective=600, amount=500 → approve)
pub(super) async fn scenario_reputation_scaling(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[11] Reputation-adjusted limit scaling");
    let agent_id = format!("pol-rep-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 10_000,
            per_tx_limit_usd: 400,
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

    // We pass the reputation-adjusted per_tx_limit (600) as the ciphertext so
    // the FHE graph sees the scaled value. Real deployments compute this
    // off-chain via `policy_config.effective_daily_limit_usd(score)` before
    // encrypting the ciphertext that gets written to the guardrails account.
    let mut dw = connect_dwallet_client().await?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        600, /* effective per_tx */
        0,
        500,
        created_at,
        2,
    )
    .await?;
    ensure!(
        domain.pending.context("[11] no pending")?.decision.approved,
        "[11] should be approved"
    );
    println!("  ✓ 500 approved under effective per_tx_limit=600 (raw=400, 150 % rep)");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 30,
        None,
        None,
    )
    .await
}
