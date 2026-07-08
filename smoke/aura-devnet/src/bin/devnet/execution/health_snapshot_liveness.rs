//! Devnet smoke checks for operational health, snapshots, and liveness sidecars.
//!
//! Covers the RPC-only lifecycle that SDK TS exercises: initialize and refresh
//! health, snapshot treasury state, close the snapshot/health accounts, enable
//! external liveness guardrails, refresh a dependency, verify close is blocked
//! while a gate is active, disable the gates, and close the liveness account.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, ConfigureLivenessGuardrailsArgs, ExternalLivenessAccount,
    HealthScoreAccount, InitExternalLivenessArgs, RefreshExternalLivenessArgs, SnapshotAccount, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const DWALLET_DEPENDENCY: u8 = 2;

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{:06}-{}", now.rem_euclid(1_000_000), &suffix[..8])
}

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0;
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer,
            treasury,
            &agent_id,
            now,
            aura_policy::PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

fn fetch_health(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<HealthScoreAccount> {
    let info = rpc.get_account(addr)?;
    Ok(HealthScoreAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn fetch_snapshot(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<SnapshotAccount> {
    let info = rpc.get_account(addr)?;
    Ok(SnapshotAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn fetch_liveness(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<ExternalLivenessAccount> {
    let info = rpc.get_account(addr)?;
    Ok(ExternalLivenessAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn init_health_score(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    health_score: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitHealthScore {
                owner: payer.pubkey(),
                treasury,
                health_score,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitHealthScore { now }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn refresh_health_score(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    health_score: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::UpdateHealthScore {
                operator: payer.pubkey(),
                treasury,
                operator_role: None,
                health_score,
            }
            .to_account_metas(None),
            instruction::RefreshHealthScore { now }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn take_snapshot(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    health_score: Pubkey,
    snapshot: Pubkey,
    snapshot_index: u32,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::TakeSnapshot {
                payer: payer.pubkey(),
                treasury,
                operator_role: None,
                health_score,
                snapshot,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::TakeSnapshot {
                snapshot_index,
                now,
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn close_snapshot(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    snapshot: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseSnapshot {
                owner: payer.pubkey(),
                treasury,
                snapshot,
            }
            .to_account_metas(None),
            instruction::CloseSnapshot {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn close_health_score(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    health_score: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseHealthScore {
                owner: payer.pubkey(),
                treasury,
                health_score,
            }
            .to_account_metas(None),
            instruction::CloseHealthScore {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn configure_liveness_guardrails(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    enabled: bool,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ConfigureLivenessGuardrails {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::ConfigureLivenessGuardrails {
                args: ConfigureLivenessGuardrailsArgs {
                    require_encrypt_freshness: enabled,
                    require_dwallet_freshness: enabled,
                    require_balance_oracle_freshness: false,
                    require_compliance_oracle_freshness: false,
                    max_staleness_secs: 60,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn init_external_liveness(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    liveness: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitExternalLiveness {
                owner: payer.pubkey(),
                treasury,
                liveness,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitExternalLiveness {
                args: InitExternalLivenessArgs {
                    max_staleness_secs: 60,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn refresh_external_liveness(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    liveness: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RefreshExternalLiveness {
                operator: payer.pubkey(),
                treasury,
                operator_role: None,
                liveness,
            }
            .to_account_metas(None),
            instruction::RefreshExternalLiveness {
                args: RefreshExternalLivenessArgs {
                    dependency: DWALLET_DEPENDENCY,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn close_external_liveness(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    liveness: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseExternalLiveness {
                owner: payer.pubkey(),
                treasury,
                liveness,
            }
            .to_account_metas(None),
            instruction::CloseExternalLiveness {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "health-liveness", seed)?;

    println!("\n[health] init, refresh, snapshot, and close accounts");
    let health_score = pda(&[b"health_score", treasury.as_ref()], &ID).0;
    init_health_score(&rpc, &payer, treasury, health_score, seed + 2)?;
    let initial_health = fetch_health(&rpc, &health_score)?;
    anyhow::ensure!(
        initial_health.treasury == treasury && initial_health.last_updated_at == seed + 2,
        "health score init mismatch"
    );
    refresh_health_score(&rpc, &payer, treasury, health_score, seed + 3)?;
    let refreshed_health = fetch_health(&rpc, &health_score)?;
    anyhow::ensure!(
        refreshed_health.last_updated_at == seed + 3
            && refreshed_health.score == initial_health.score,
        "health score refresh mismatch"
    );

    let snapshot_index = seed.rem_euclid(1_000_000) as u32;
    let snapshot_index_bytes = snapshot_index.to_le_bytes();
    let snapshot = pda(
        &[
            b"treasury_snapshot",
            treasury.as_ref(),
            snapshot_index_bytes.as_ref(),
        ],
        &ID,
    )
    .0;
    take_snapshot(
        &rpc,
        &payer,
        treasury,
        health_score,
        snapshot,
        snapshot_index,
        seed + 4,
    )?;
    let snap = fetch_snapshot(&rpc, &snapshot)?;
    anyhow::ensure!(
        snap.treasury == treasury
            && snap.snapshot_index == snapshot_index
            && snap.health_score == refreshed_health.score,
        "snapshot account mismatch"
    );
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?.last_snapshot_at == Some(seed + 4),
        "treasury snapshot timestamp not persisted"
    );
    close_snapshot(&rpc, &payer, treasury, snapshot)?;
    anyhow::ensure!(
        rpc.get_account(&snapshot).is_err(),
        "closed snapshot account still exists"
    );
    close_health_score(&rpc, &payer, treasury, health_score)?;
    anyhow::ensure!(
        rpc.get_account(&health_score).is_err(),
        "closed health score account still exists"
    );
    println!("  ok health score and snapshot lifecycle verified");

    println!("\n[liveness] configure, init, refresh, close guard, disable, close");
    let liveness = pda(&[b"external_liveness", treasury.as_ref()], &ID).0;
    configure_liveness_guardrails(&rpc, &payer, treasury, true, seed + 5)?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .policy_config
            .liveness_config
            .require_dwallet_freshness,
        "liveness guardrail was not enabled"
    );
    init_external_liveness(&rpc, &payer, treasury, liveness, seed + 6)?;
    refresh_external_liveness(&rpc, &payer, treasury, liveness, seed + 7)?;
    let live = fetch_liveness(&rpc, &liveness)?;
    anyhow::ensure!(
        live.dwallet_last_verified_at == seed + 7 && live.updated_by == owner,
        "liveness refresh mismatch"
    );
    let close_while_enabled = close_external_liveness(&rpc, &payer, treasury, liveness);
    anyhow::ensure!(
        close_while_enabled.is_err(),
        "liveness close should reject while freshness gates are enabled"
    );
    configure_liveness_guardrails(&rpc, &payer, treasury, false, seed + 8)?;
    close_external_liveness(&rpc, &payer, treasury, liveness)?;
    anyhow::ensure!(
        rpc.get_account(&liveness).is_err(),
        "closed liveness account still exists"
    );
    println!("  ok liveness guardrails and close guard verified");

    println!("\nhealth/snapshot/liveness smoke checks passed on devnet.");
    Ok(())
}
