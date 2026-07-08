//! Devnet smoke checks for policy template lifecycle.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, CreatePolicyTemplateArgs, PolicyConfigRecord, PolicyHistoryAccount,
    PolicyTemplate, UpdatePolicyTemplateArgs, ID,
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

fn policy_record(daily_limit_usd: u64, per_tx_limit_usd: u64) -> PolicyConfigRecord {
    let mut config = aura_policy::PolicyConfig::default();
    config.daily_limit_usd = daily_limit_usd;
    config.per_tx_limit_usd = per_tx_limit_usd;
    PolicyConfigRecord::from_domain(&config)
}

fn fetch_template(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<PolicyTemplate> {
    let info = rpc.get_account(addr)?;
    Ok(PolicyTemplate::try_deserialize(&mut info.data.as_slice())?)
}

fn fetch_history(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<PolicyHistoryAccount> {
    let info = rpc.get_account(addr)?;
    Ok(PolicyHistoryAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "policy-template", seed)?;
    let template_id = seed as u64;
    let template_id_bytes = template_id.to_le_bytes();
    let policy_template = pda(
        &[
            b"policy_template",
            owner.as_ref(),
            template_id_bytes.as_ref(),
        ],
        &ID,
    )
    .0;

    println!("\n[template] create policy template from explicit config");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CreatePolicyTemplate {
                owner,
                policy_template,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::CreatePolicyTemplate {
                args: CreatePolicyTemplateArgs {
                    template_id,
                    name: "smoke-template".to_string(),
                    description: "devnet smoke policy template".to_string(),
                    shared: false,
                    source_preset: None,
                    config: Some(policy_record(8_000, 800)),
                    now: seed + 2,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let template = fetch_template(&rpc, &policy_template)?;
    anyhow::ensure!(
        template.version == 1 && template.config.daily_limit_usd == 8_000,
        "created template mismatch"
    );
    println!("  ok template created");

    println!("\n[template] update template config and metadata");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManagePolicyTemplate {
                owner,
                policy_template,
            }
            .to_account_metas(None),
            instruction::UpdatePolicyTemplate {
                args: UpdatePolicyTemplateArgs {
                    name: "smoke-template-v2".to_string(),
                    description: "updated devnet smoke policy template".to_string(),
                    shared: true,
                    config: policy_record(7_000, 700),
                    now: seed + 3,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let template = fetch_template(&rpc, &policy_template)?;
    anyhow::ensure!(
        template.version == 2 && template.shared && template.config.per_tx_limit_usd == 700,
        "updated template mismatch"
    );
    println!("  ok template updated");

    println!("\n[history] init history and snapshot current policy");
    let policy_history = pda(&[b"policy_history", treasury.as_ref()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitPolicyHistory {
                owner,
                treasury,
                policy_history,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitPolicyHistory {}.data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RecordPolicySnapshot {
                owner,
                treasury,
                policy_history,
            }
            .to_account_metas(None),
            instruction::RecordPolicySnapshot { now: seed + 4 }.data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_history(&rpc, &policy_history)?.version_count == 1,
        "initial policy snapshot not recorded"
    );
    println!("  ok initial policy snapshot recorded");

    println!("\n[template] apply template and record new snapshot");
    let before_version = fetch_treasury_domain(&rpc, &treasury)?.current_policy_version;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ApplyPolicyTemplate {
                owner,
                treasury,
                policy_template,
            }
            .to_account_metas(None),
            instruction::ApplyPolicyTemplate { now: seed + 5 }.data(),
        )],
        &[],
    )?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        domain.current_policy_version == before_version + 1
            && domain.policy_config.daily_limit_usd == 7_000
            && domain.policy_config.per_tx_limit_usd == 700,
        "applied template did not update treasury policy"
    );
    anyhow::ensure!(
        fetch_template(&rpc, &policy_template)?.applied_count == 1,
        "template applied_count not incremented"
    );
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RecordPolicySnapshot {
                owner,
                treasury,
                policy_history,
            }
            .to_account_metas(None),
            instruction::RecordPolicySnapshot { now: seed + 6 }.data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_history(&rpc, &policy_history)?.version_count == 2,
        "post-template policy snapshot not recorded"
    );
    println!("  ok template applied and history updated");

    println!("\n[template] close template account");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ClosePolicyTemplate {
                owner,
                policy_template,
            }
            .to_account_metas(None),
            instruction::ClosePolicyTemplate {}.data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        rpc.get_account(&policy_template).is_err(),
        "closed policy template account still exists"
    );
    println!("  ok template closed");

    println!("\npolicy template lifecycle smoke checks passed on devnet.");
    Ok(())
}
