//! Devnet smoke checks for trust envelope and agent identity.
//!
//! All trust/identity state lives in `TrustIdentityAccount` — a separate PDA
//! derived from the treasury key — to keep `TreasuryAccount` within the SBF
//! stack-frame limit.
//!
//! Test sequence:
//!   1. `init_trust_identity` — creates the PDA for each treasury.
//!   2. `configure_trust_policy` — stores custom tier thresholds on the PDA.
//!   3. `restore_trust` — steps the tier down (no-op on Trusted).
//!   4. `register_agent` — stores a scoped secondary agent on the PDA.
//!   5. `revoke_agent` — disables the agent; PDA confirms it.
//!   6. `nominate_successor_owner` — records a timelocked handover on the PDA.
//!
//! Not smoke-tested (require Ika dWallet CPI):
//!   `execute_ownership_handover`, `emergency_revoke_agent` — unit tests only.

use anchor_lang::{system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, constants::{OWNERSHIP_HANDOVER_TIMELOCK_SECS, TRUST_IDENTITY_SEED},
    instruction, ConfigureTrustPolicyArgs, NominateSuccessorArgs, RegisterAgentArgs,
    TrustIdentityAccount, ID,
};
use aura_devnet::{activate_treasury, create_treasury_ix, devnet_rpc, load_payer, now_unix, pda, send_tx};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction { program_id: ID, accounts, data }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{now}-{}", &suffix[..8])
}

fn create_active_treasury(rpc: &RpcClient, payer: &Keypair, prefix: &str, now: i64) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(&[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()], &ID).0;
    send_tx(rpc, payer, vec![create_treasury_ix(payer, treasury, &agent_id, now, aura_policy::PolicyConfig::default())], &[])?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

/// Derives the TrustIdentityAccount PDA for a treasury.
fn trust_identity_pda(treasury: &Pubkey) -> Pubkey {
    pda(&[TRUST_IDENTITY_SEED, treasury.as_ref()], &ID).0
}

/// Creates the TrustIdentityAccount PDA via `init_trust_identity`.
fn init_trust_identity(rpc: &RpcClient, payer: &Keypair, treasury: Pubkey, now: i64) -> anyhow::Result<Pubkey> {
    let trust_identity = trust_identity_pda(&treasury);
    let sig = send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitTrustIdentity {
                owner: payer.pubkey(),
                treasury,
                trust_identity,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitTrustIdentity { now }.data(),
        )],
        &[],
    )?;
    println!("  init_trust_identity tx: {sig}");
    Ok(trust_identity)
}

fn fetch_trust_identity(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<TrustIdentityAccount> {
    let info = rpc.get_account(addr)?;
    Ok(TrustIdentityAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    // ── [1] init_trust_identity + configure_trust_policy ─────────────────────

    println!("\n[trust policy] init_trust_identity + configure_trust_policy");
    let treasury = create_active_treasury(&rpc, &payer, "ti-trust", seed)?;
    let trust_identity = init_trust_identity(&rpc, &payer, treasury, seed + 2)?;

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::TrustEnvelopeConfig { owner, treasury, trust_identity }.to_account_metas(None),
            instruction::ConfigureTrustPolicy {
                args: ConfigureTrustPolicyArgs {
                    watch_threshold: 30,
                    restricted_threshold: 80,
                    lockdown_threshold: 200,
                    watch_multiplier_bps: 6_000,
                    restricted_multiplier_bps: 2_000,
                    decay_points_per_period: 5,
                    decay_period_secs: 3_600,
                    now: seed + 3,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");

    let ti = fetch_trust_identity(&rpc, &trust_identity)?;
    anyhow::ensure!(ti.trust_config.watch_threshold == 30, "watch_threshold not stored");
    anyhow::ensure!(ti.trust_tier == 0, "tier should still be Trusted after configure");
    println!("  ok custom thresholds stored on TrustIdentityAccount (watch=30, lockdown=200)");

    // ── [2] restore_trust (no-op on Trusted) ─────────────────────────────────

    println!("\n[trust policy] restore_trust is a no-op on Trusted tier");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::TrustEnvelopeConfig { owner, treasury, trust_identity }.to_account_metas(None),
            instruction::RestoreTrust { now: seed + 4 }.data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");
    let ti = fetch_trust_identity(&rpc, &trust_identity)?;
    anyhow::ensure!(ti.trust_tier == 0, "tier should remain Trusted");
    println!("  ok restore_trust on Trusted tier: no-op");

    // ── [3] init_trust_identity + register_agent ─────────────────────────────

    println!("\n[agent identity] register_agent");
    let treasury2 = create_active_treasury(&rpc, &payer, "ti-agent", seed + 100)?;
    let trust_identity2 = init_trust_identity(&rpc, &payer, treasury2, seed + 101)?;
    let agent_key = Keypair::new().pubkey();

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::AgentManage { owner, treasury: treasury2, trust_identity: trust_identity2 }
                .to_account_metas(None),
            instruction::RegisterAgent {
                args: RegisterAgentArgs {
                    key: agent_key,
                    label: "trading-agent".to_string(),
                    allowed_chains: vec![1u8],  // ETH only
                    allowed_tx_types: vec![0u8], // Transfer only
                    daily_limit_usd: Some(5_000),
                    now: seed + 102,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");

    let ti = fetch_trust_identity(&rpc, &trust_identity2)?;
    let agent = ti
        .agents
        .iter()
        .find(|a| a.key == agent_key)
        .ok_or_else(|| anyhow::anyhow!("agent not found in TrustIdentityAccount"))?;
    anyhow::ensure!(agent.enabled, "agent should be enabled");
    anyhow::ensure!(agent.scope.allowed_chains == vec![1u8], "chain scope mismatch");
    anyhow::ensure!(agent.scope.daily_limit_usd == Some(5_000), "daily limit mismatch");
    println!("  ok agent {} registered (ETH-only, limit=5000 usd)", agent_key);

    // ── [4] revoke_agent ──────────────────────────────────────────────────────

    println!("\n[agent identity] revoke_agent");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::AgentManage { owner, treasury: treasury2, trust_identity: trust_identity2 }
                .to_account_metas(None),
            instruction::RevokeAgent { key: agent_key, now: seed + 103 }.data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");

    let ti = fetch_trust_identity(&rpc, &trust_identity2)?;
    let agent = ti.agents.iter().find(|a| a.key == agent_key).unwrap();
    anyhow::ensure!(!agent.enabled, "agent should be disabled after revoke");
    println!("  ok agent disabled after revoke_agent");

    // ── [5] nominate_successor_owner ──────────────────────────────────────────

    println!("\n[ownership handover] nominate_successor_owner");
    let successor = Keypair::new().pubkey();
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::OwnershipHandover {
                caller: owner,
                treasury: treasury2,
                trust_identity: trust_identity2,
            }
            .to_account_metas(None),
            instruction::NominateSuccessorOwner {
                args: NominateSuccessorArgs { new_owner: successor, now: seed + 104 },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  tx: {sig}");

    let ti = fetch_trust_identity(&rpc, &trust_identity2)?;
    let handover = ti
        .pending_ownership_handover
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("pending handover not stored in TrustIdentityAccount"))?;
    anyhow::ensure!(
        handover.successor_owner == successor,
        "successor pubkey mismatch"
    );
    anyhow::ensure!(
        handover.executable_after == seed + 104 + OWNERSHIP_HANDOVER_TIMELOCK_SECS,
        "handover timelock mismatch"
    );
    println!(
        "  ok handover nominated → {} (executable after {}s)",
        successor, OWNERSHIP_HANDOVER_TIMELOCK_SECS
    );

    println!("\ntrust envelope + agent identity smoke checks passed on devnet.");
    println!("Note: execute_ownership_handover requires a live dWallet CPI; covered by unit tests.");
    Ok(())
}
