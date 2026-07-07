//! Devnet smoke checks for owner-governance timelock boundaries.
//!
//! Exercises real AI-authority rotation and policy-config change proposals:
//! early execution rejects, exact boundary execution succeeds, wrong change id
//! rejects, and cancelling with no pending AI rotation is state-preserving.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::{accounts, constants, instruction, PolicyConfigRecord, ID};
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

fn owner_treasury_ix(payer: &Keypair, treasury: Pubkey, data: Vec<u8>) -> Instruction {
    ix(
        accounts::OwnerTreasury {
            owner: payer.pubkey(),
            treasury,
        }
        .to_account_metas(None),
        data,
    )
}

fn policy_record(daily_limit_usd: u64, per_tx_limit_usd: u64) -> PolicyConfigRecord {
    let mut config = aura_policy::PolicyConfig::default();
    config.daily_limit_usd = daily_limit_usd;
    config.per_tx_limit_usd = per_tx_limit_usd;
    PolicyConfigRecord::from_domain(&config)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "governance", seed)?;

    println!("\n[ai rotation] early execution rejects, boundary succeeds");
    let new_ai = Keypair::new().pubkey();
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ProposeAiRotation {
                new_ai_authority: new_ai,
                now: seed + 2,
            }
            .data(),
        )],
        &[],
    )?;
    let pending = fetch_treasury_domain(&rpc, &treasury)?
        .pending_ai_rotation
        .ok_or_else(|| anyhow::anyhow!("AI rotation was not staged"))?;
    anyhow::ensure!(
        pending.executable_after == seed + 2 + constants::AI_ROTATION_TIMELOCK_SECS,
        "AI rotation timelock mismatch"
    );
    let early = send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ExecuteAiRotation { now: seed + 3 }.data(),
        )],
        &[],
    );
    anyhow::ensure!(early.is_err(), "early AI rotation should reject");
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ExecuteAiRotation {
                now: pending.executable_after,
            }
            .data(),
        )],
        &[],
    )?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        domain.ai_authority == new_ai.to_string() && domain.pending_ai_rotation.is_none(),
        "AI rotation did not execute cleanly"
    );
    println!("  ok AI authority rotated exactly at boundary");

    println!("\n[ai rotation] cancel with no pending state is idempotent");
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::CancelAiRotation { now: seed + 4 }.data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .pending_ai_rotation
            .is_none(),
        "cancel introduced pending AI rotation state"
    );
    println!("  ok empty cancel preserved state");

    println!("\n[config change] early execution rejects, boundary succeeds");
    let change_id = seed as u64;
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ProposeConfigChange {
                change_id,
                new_policy_config: policy_record(12_000, 1_200),
                now: seed + 5,
            }
            .data(),
        )],
        &[],
    )?;
    let pending = fetch_treasury_domain(&rpc, &treasury)?
        .pending_config_change
        .ok_or_else(|| anyhow::anyhow!("config change was not staged"))?;
    anyhow::ensure!(
        pending.executable_after == seed + 5 + constants::CONFIG_CHANGE_TIMELOCK_SECS,
        "config change timelock mismatch"
    );
    let early = send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ExecuteConfigChange {
                change_id,
                now: seed + 6,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(early.is_err(), "early config execution should reject");
    let before_version = fetch_treasury_domain(&rpc, &treasury)?.current_policy_version;
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ExecuteConfigChange {
                change_id,
                now: pending.executable_after,
            }
            .data(),
        )],
        &[],
    )?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        domain.pending_config_change.is_none()
            && domain.current_policy_version == before_version + 1
            && domain.policy_config.daily_limit_usd == 12_000,
        "config change did not apply at boundary"
    );
    println!("  ok policy config executed exactly at boundary");

    println!("\n[config change] mismatched id rejects after timelock");
    let change_id = change_id + 1;
    send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ProposeConfigChange {
                change_id,
                new_policy_config: policy_record(13_000, 1_300),
                now: seed + 7,
            }
            .data(),
        )],
        &[],
    )?;
    let pending = fetch_treasury_domain(&rpc, &treasury)?
        .pending_config_change
        .ok_or_else(|| anyhow::anyhow!("second config change was not staged"))?;
    let mismatched = send_tx(
        &rpc,
        &payer,
        vec![owner_treasury_ix(
            &payer,
            treasury,
            instruction::ExecuteConfigChange {
                change_id: change_id + 99,
                now: pending.executable_after,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        mismatched.is_err(),
        "mismatched config change id should reject"
    );
    let still_pending = fetch_treasury_domain(&rpc, &treasury)?
        .pending_config_change
        .ok_or_else(|| anyhow::anyhow!("mismatched id cleared pending config change"))?;
    anyhow::ensure!(
        still_pending.change_id == change_id,
        "mismatched id mutated pending config change"
    );
    println!("  ok mismatched id rejected without clearing pending state");

    println!("\ngovernance timelock smoke checks passed on devnet.");
    Ok(())
}
