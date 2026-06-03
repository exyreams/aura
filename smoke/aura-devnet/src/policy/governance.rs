//! Guardian and multisig policy-override smoke scenarios.

use super::{harness::*, prelude::*};

/// [7] Emergency multisig override — 2-of-3 guardians raise daily limit from 500 to 2 000
pub(super) async fn scenario_multisig_override(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[7] Multisig override 2-of-3");
    let g1 = Keypair::new();
    let g2 = Keypair::new();
    let g3 = Keypair::new();
    fund_ephemeral_signers(rpc, payer, &[&g1, &g2, &g3])?;

    let agent_id = format!("pol-multisig-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 500,
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

    // Attach 2-of-3 multisig
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureMultisig {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureMultisig {
                args: ConfigureMultisigArgs {
                    required_signatures: 2,
                    guardians: vec![g1.pubkey(), g2.pubkey(), g3.pubkey()],
                    guardian_weights: vec![],
                    required_approval_weight: 0,
                    timestamp: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.multisig.is_some(),
        "[7] multisig not attached"
    );
    println!("  ✓ 2-of-3 multisig configured (daily_limit=500)");

    // 600 USD should be denied under limit 500
    let domain_deny = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        500,
        5_000,
        0,
        600,
        created_at,
        3,
    )
    .await?;
    ensure!(
        !domain_deny
            .pending
            .context("[7] no pending")?
            .decision
            .approved,
        "[7] should be denied before override"
    );
    println!("  ✓ 600 USD denied under original limit");
    execute_denied(rpc, payer, treasury, created_at + 30)?;

    // g1 proposes override to 2 000
    send_tx(
        rpc,
        &g1,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeOverride {
                guardian: g1.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ProposeOverride {
                new_daily_limit_usd: 2_000,
                now: created_at + 40,
            }
            .data(),
        }],
        &[],
    )?;
    println!("  ✓ g1 proposed override (1/2 signatures)");

    // g2 collects — quorum reached, override applied immediately
    send_tx(
        rpc,
        &g2,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::CollectOverrideSignature {
                guardian: g2.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::CollectOverrideSignature {
                now: created_at + 41,
            }
            .data(),
        }],
        &[],
    )?;

    let domain_override = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain_override.policy_config.daily_limit_usd == 2_000,
        "[7] daily limit should be 2 000"
    );
    ensure!(
        domain_override
            .multisig
            .as_ref()
            .map(|m| m.pending_override.is_none())
            .unwrap_or(false),
        "[7] pending override should be cleared"
    );
    println!("  ✓ quorum reached, daily limit raised to 2 000");

    // 600 USD should now be approved
    let mut dw = connect_dwallet_client().await?;
    let domain_approve = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        2_000,
        5_000,
        0,
        600,
        created_at,
        50,
    )
    .await?;
    ensure!(
        domain_approve
            .pending
            .context("[7] no pending")?
            .decision
            .approved,
        "[7] should be approved after override"
    );
    println!("  ✓ 600 USD approved under raised limit");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 80,
        None,
        None,
    )
    .await
}

/// [9] Single-guardian override — 1-of-1 quorum reached instantly on propose
pub(super) async fn scenario_single_guardian_override(
    rpc: &RpcClient,
    payer: &Keypair,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[9] Single-guardian override (1-of-1)");
    let guardian = Keypair::new();
    fund_ephemeral_signers(rpc, payer, &[&guardian])?;

    let agent_id = format!("pol-1of1-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 100,
            per_tx_limit_usd: 5_000,
            ..Default::default()
        },
    )?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureMultisig {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureMultisig {
                args: ConfigureMultisigArgs {
                    required_signatures: 1,
                    guardians: vec![guardian.pubkey()],
                    guardian_weights: vec![],
                    required_approval_weight: 0,
                    timestamp: created_at + 1,
                },
            }
            .data(),
        }],
        &[],
    )?;

    // Single propose → quorum → override applied in same instruction
    send_tx(
        rpc,
        &guardian,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeOverride {
                guardian: guardian.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ProposeOverride {
                new_daily_limit_usd: 5_000,
                now: created_at + 2,
            }
            .data(),
        }],
        &[],
    )?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain.policy_config.daily_limit_usd == 5_000,
        "[9] daily limit should be 5 000"
    );
    ensure!(
        domain
            .multisig
            .as_ref()
            .map(|m| m.pending_override.is_none())
            .unwrap_or(false),
        "[9] pending override should be cleared"
    );
    println!("  ✓ 1-of-1 override applied instantly, daily_limit=5 000");
    Ok(())
}
