//! Devnet smoke checks for policy versioning and the monetization control plane.
//!
//! Test sequence:
//!   1. `init_policy_history` + `record_policy_snapshot` — record version 1.
//!   2. `rollback_policy` — restore the recorded version (applies immediately
//!      when it does not loosen) and append a new forward version.
//!   3. `rollback_policy` to an unknown version — must fail.
//!   4. `start_canary` + `promote_canary` — stage a candidate and promote it
//!      into the enforced policy; the canary account is closed on promotion.
//!   5. `start_canary` + `discard_canary` — drop a candidate without promoting.
//!   6. `init_protocol_config` (idempotent across runs) + `update_protocol_config`
//!      — stage an economic change; committing before the timelock must fail.
//!
//! Not smoke-tested (needs a live dWallet CPI signer): the shadow-evaluation
//! divergence tally on the propose path — covered by unit tests.

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use aura_core::{
    accounts,
    constants::{
        POLICY_CANARY_SEED, POLICY_HISTORY_SEED, PROTOCOL_CONFIG_SEED,
        PROTOCOL_CONFIG_UPDATE_TIMELOCK_SECS,
    },
    instruction, PolicyCanaryAccount, PolicyConfigRecord, PolicyHistoryAccount,
    ProtocolConfigAccount, ProtocolConfigArgs, TreasuryAccount, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, load_payer, now_unix, pda, send_tx,
};
use aura_policy::PolicyConfig;
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

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(&[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()], &ID).0;
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(payer, treasury, &agent_id, now, PolicyConfig::default())],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

fn init_policy_history(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
) -> anyhow::Result<Pubkey> {
    let policy_history = pda(&[POLICY_HISTORY_SEED, treasury.as_ref()], &ID).0;
    let sig = send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitPolicyHistory {
                owner: payer.pubkey(),
                treasury,
                policy_history,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitPolicyHistory {}.data(),
        )],
        &[],
    )?;
    println!("  init_policy_history tx: {sig}");
    Ok(policy_history)
}

fn fetch_history(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<PolicyHistoryAccount> {
    let info = rpc.get_account(addr)?;
    Ok(PolicyHistoryAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn fetch_treasury(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<TreasuryAccount> {
    let info = rpc.get_account(addr)?;
    Ok(TreasuryAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    // [1] policy history + snapshot
    println!("\n[versioning] init_policy_history + record_policy_snapshot");
    let treasury = create_active_treasury(&rpc, &payer, "vm-roll", seed)?;
    let policy_history = init_policy_history(&rpc, &payer, treasury)?;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RecordPolicySnapshot { owner, treasury, policy_history }
                .to_account_metas(None),
            instruction::RecordPolicySnapshot { now: seed + 2 }.data(),
        )],
        &[],
    )?;
    println!("  record_policy_snapshot tx: {sig}");
    let history = fetch_history(&rpc, &policy_history)?;
    anyhow::ensure!(history.version_count == 1, "expected one recorded version");
    println!("  ok recorded policy version 1");

    // [2] rollback to the recorded version (no-loosening → applies immediately)
    println!("\n[versioning] rollback_policy to version 1");
    let default_record = PolicyConfigRecord::from_domain(&PolicyConfig::default());
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RollbackPolicy { owner, treasury, policy_history }.to_account_metas(None),
            instruction::RollbackPolicy {
                target_version: 1,
                candidate: default_record.clone(),
                now: seed + 3,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  rollback_policy tx: {sig}");
    let history = fetch_history(&rpc, &policy_history)?;
    anyhow::ensure!(
        history.version_count == 2,
        "rollback should append a new forward version"
    );
    println!("  ok rollback restored version 1 and appended forward version 2");

    // [3] rollback to an unknown version must fail
    println!("\n[versioning] rollback_policy to an unknown version is rejected");
    let res = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RollbackPolicy { owner, treasury, policy_history }.to_account_metas(None),
            instruction::RollbackPolicy {
                target_version: 99,
                candidate: default_record,
                now: seed + 4,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(res.is_err(), "rollback to unknown version should fail");
    println!("  ok unknown version rejected");

    // [4] canary: start + promote
    println!("\n[canary] start_canary + promote_canary");
    let treasury2 = create_active_treasury(&rpc, &payer, "vm-canary", seed + 100)?;
    let policy_history2 = init_policy_history(&rpc, &payer, treasury2)?;
    let policy_canary = pda(&[POLICY_CANARY_SEED, treasury2.as_ref()], &ID).0;

    let mut strict = PolicyConfig::default();
    strict.per_tx_limit_usd = 100;
    let strict_record = PolicyConfigRecord::from_domain(&strict);
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::StartCanary {
                owner,
                treasury: treasury2,
                policy_canary,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::StartCanary {
                candidate: strict_record,
                sample_cap: 0,
                now: seed + 102,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  start_canary tx: {sig}");
    let canary_info = rpc.get_account(&policy_canary)?;
    let canary = PolicyCanaryAccount::try_deserialize(&mut canary_info.data.as_slice())?;
    anyhow::ensure!(canary.enabled, "canary should be enabled");
    anyhow::ensure!(
        canary.candidate.per_tx_limit_usd == 100,
        "candidate per-tx cap not stored"
    );
    println!("  ok candidate staged (per_tx=100)");

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::PromoteCanary {
                owner,
                treasury: treasury2,
                policy_history: policy_history2,
                policy_canary,
            }
            .to_account_metas(None),
            instruction::PromoteCanary { now: seed + 103 }.data(),
        )],
        &[],
    )?;
    println!("  promote_canary tx: {sig}");
    anyhow::ensure!(
        rpc.get_account(&policy_canary).is_err(),
        "canary account should be closed after promotion"
    );
    let acct = fetch_treasury(&rpc, &treasury2)?;
    anyhow::ensure!(
        acct.policy_config.per_tx_limit_usd == 100,
        "promoted candidate should be the enforced policy"
    );
    println!("  ok candidate promoted into enforced policy; canary closed");

    // [5] canary: discard
    println!("\n[canary] start_canary + discard_canary");
    let treasury3 = create_active_treasury(&rpc, &payer, "vm-discard", seed + 200)?;
    let policy_canary3 = pda(&[POLICY_CANARY_SEED, treasury3.as_ref()], &ID).0;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::StartCanary {
                owner,
                treasury: treasury3,
                policy_canary: policy_canary3,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::StartCanary {
                candidate: PolicyConfigRecord::from_domain(&PolicyConfig::default()),
                sample_cap: 0,
                now: seed + 202,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  start_canary tx: {sig}");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DiscardCanary {
                owner,
                treasury: treasury3,
                policy_canary: policy_canary3,
            }
            .to_account_metas(None),
            instruction::DiscardCanary {}.data(),
        )],
        &[],
    )?;
    println!("  discard_canary tx: {sig}");
    anyhow::ensure!(
        rpc.get_account(&policy_canary3).is_err(),
        "discarded canary should be closed"
    );
    println!("  ok candidate discarded; canary closed");

    // [6] protocol config: init (idempotent) + update + early-commit rejection
    println!("\n[monetization] init_protocol_config + update_protocol_config");
    let protocol_config = pda(&[PROTOCOL_CONFIG_SEED], &ID).0;
    if rpc.get_account(&protocol_config).is_err() {
        let sig = send_tx(
            &rpc,
            &payer,
            vec![ix(
                accounts::InitProtocolConfig {
                    payer: owner,
                    protocol_config,
                    system_program: SYSTEM_PROGRAM_ID,
                }
                .to_account_metas(None),
                instruction::InitProtocolConfig {
                    args: ProtocolConfigArgs {
                        protocol_authority: owner,
                        protocol_recipient: owner,
                        protocol_fee_bps: 10,
                        creation_fee_usd: 100,
                        min_integrator_bps: 0,
                        max_integrator_bps: 50,
                        settlement_asset: 0,
                        enabled: true,
                    },
                    now: seed + 300,
                }
                .data(),
            )],
            &[],
        )?;
        println!("  init_protocol_config tx: {sig}");
    } else {
        println!("  protocol config singleton already exists; reusing");
    }

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProtocolConfigAuthority { authority: owner, protocol_config }
                .to_account_metas(None),
            instruction::UpdateProtocolConfig {
                args: ProtocolConfigArgs {
                    protocol_authority: owner,
                    protocol_recipient: owner,
                    protocol_fee_bps: 25,
                    creation_fee_usd: 150,
                    min_integrator_bps: 0,
                    max_integrator_bps: 75,
                    settlement_asset: 0,
                    enabled: true,
                },
                now: seed + 301,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  update_protocol_config tx: {sig}");
    let info = rpc.get_account(&protocol_config)?;
    let config = ProtocolConfigAccount::try_deserialize(&mut info.data.as_slice())?;
    let pending = config
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("pending update not staged"))?;
    anyhow::ensure!(pending.protocol_fee_bps == 25, "staged fee bps mismatch");
    println!("  ok update staged behind a {PROTOCOL_CONFIG_UPDATE_TIMELOCK_SECS}s timelock");

    println!("\n[monetization] commit_protocol_config before the timelock is rejected");
    let res = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProtocolConfigAuthority { authority: owner, protocol_config }
                .to_account_metas(None),
            instruction::CommitProtocolConfig { now: seed + 302 }.data(),
        )],
        &[],
    );
    anyhow::ensure!(res.is_err(), "commit before timelock should fail");
    println!("  ok early commit rejected");

    println!("\npolicy versioning + monetization control-plane smoke checks passed on devnet.");
    Ok(())
}
