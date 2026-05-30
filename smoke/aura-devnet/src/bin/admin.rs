//! Standalone devnet check for all 16 doc-01 CRUD-completion instructions.
//!
//! Runs without the Ika/Encrypt pre-alpha networks - only `aura-core` + devnet
//! RPC. For each new instruction it performs the required setup (create the
//! entity), runs the new instruction, and asserts the on-chain result (a failed
//! transaction aborts the run). Sequential and verbose so a failure is obvious.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, swarm_pool_seeds, ConfigureBudgetEnvelopeArgs, ConfigureSwarmArgs,
    GrantOperatorRoleArgs, InitExposureGroupArgs, InitExternalLivenessArgs, InitSwarmPoolArgs,
    IssueSessionKeyArgs, SetRecipientLimitArgs, UpdateOperatorRoleArgs, UpdateSessionKeyArgs,
    UpdateTreasuryMetadataArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
};

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    println!("Payer:   {owner}");
    println!("Program: {ID}\n");

    let t0 = now_unix();
    let agent_id = format!("admin-all-{t0}");
    let treasury = pda(&[b"treasury", owner.as_ref(), agent_id.as_bytes()], &ID).0;

    send_tx(
        &rpc,
        &payer,
        vec![create_treasury_ix(
            &payer,
            treasury,
            &agent_id,
            t0,
            aura_policy::PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(&rpc, &payer, treasury, t0 + 1)?;
    println!("ok treasury created + activated: {treasury}\n");

    // 1-3. OwnerTreasury-context instructions.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::OwnerTreasury { owner, treasury }.to_account_metas(None),
            instruction::UpdateTreasuryMetadata {
                args: UpdateTreasuryMetadataArgs {
                    pending_transaction_ttl_secs: Some(1_800),
                    high_risk_threshold: Some(90),
                    high_risk_require_guardian: Some(true),
                    sanctions_check_enabled: None,
                    now: t0 + 2,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let d = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        d.pending_transaction_ttl_secs == 1_800 && d.high_risk_threshold == 90,
        "metadata not persisted"
    );
    println!("[1] update_treasury_metadata");

    let recipient = "0xc0ffee00000000000000000000000000000c0ffee".to_string();
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::OwnerTreasury { owner, treasury }.to_account_metas(None),
            instruction::SetRecipientLimit {
                args: SetRecipientLimitArgs {
                    chain: 1,
                    address: recipient.clone(),
                    daily_limit_usd: 500,
                    per_tx_limit_usd: Some(100),
                    now: t0 + 3,
                },
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .policy_config
            .recipient_limits
            .iter()
            .any(|l| l.address == recipient),
        "recipient limit not set"
    );
    println!("[2] set_recipient_limit");

    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::OwnerTreasury { owner, treasury }.to_account_metas(None),
            instruction::RemoveRecipientLimit {
                chain: 1,
                address: recipient.clone(),
                now: t0 + 4,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .policy_config
            .recipient_limits
            .is_empty(),
        "recipient limit not removed"
    );
    println!("[3] remove_recipient_limit");

    // 4. update_operator_role (setup: grant).
    let operator = Keypair::new().pubkey();
    let operator_role = pda(&[b"operator_role", treasury.as_ref(), operator.as_ref()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::GrantOperatorRole {
                owner,
                operator,
                treasury,
                operator_role,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::GrantOperatorRole {
                args: GrantOperatorRoleArgs {
                    permission_mask: 0b11,
                    expires_at: t0 + 1_000_000,
                    now: t0 + 5,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::UpdateOperatorRole {
                owner,
                treasury,
                operator_role,
            }
            .to_account_metas(None),
            instruction::UpdateOperatorRole {
                args: UpdateOperatorRoleArgs {
                    permission_mask: Some(0b111),
                    expires_at: Some(t0 + 2_000_000),
                    now: t0 + 6,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("[4] update_operator_role (grant -> update)");

    // 5. update_session_key (setup: issue).
    let session_key = Keypair::new().pubkey();
    let session_key_account = pda(
        &[b"session_key", treasury.as_ref(), session_key.as_ref()],
        &ID,
    )
    .0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::IssueSessionKey {
                authority: owner,
                treasury,
                session_key_account,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::IssueSessionKey {
                args: IssueSessionKeyArgs {
                    session_key,
                    duration_secs: 86_400,
                    max_amount_usd_per_tx: Some(1_000),
                    max_daily_spend_usd: Some(5_000),
                    allowed_chains: vec![1, 2],
                    allowed_tx_types: vec![0],
                    max_proposal_count: Some(10),
                    now: t0 + 7,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::UpdateSessionKey {
                authority: owner,
                treasury,
                session_key_account,
            }
            .to_account_metas(None),
            instruction::UpdateSessionKey {
                args: UpdateSessionKeyArgs {
                    extend_duration_secs: Some(3_600),
                    max_amount_usd_per_tx: Some(Some(2_000)),
                    max_daily_spend_usd: Some(None),
                    allowed_chains: Some(vec![1]),
                    allowed_tx_types: None,
                    max_proposal_count: Some(Some(20)),
                    now: t0 + 8,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("[5] update_session_key (issue -> update)");

    // 6. update_fee_recipient (setup: init_fee_vault).
    let fee_vault = pda(&[b"fee_vault", treasury.as_ref()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitFeeVault {
                owner,
                treasury,
                fee_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitFeeVault {
                protocol_fee_recipient: owner,
                now: t0 + 9,
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::UpdateFeeRecipient {
                owner,
                treasury,
                fee_vault,
            }
            .to_account_metas(None),
            instruction::UpdateFeeRecipient {
                new_recipient: Keypair::new().pubkey(),
            }
            .data(),
        )],
        &[],
    )?;
    println!("[6] update_fee_recipient (init -> update)");

    // 7. remove_budget_envelope (setup: configure).
    let envelope_id: u64 = 1;
    let budget_envelope = pda(
        &[
            b"budget_envelope",
            treasury.as_ref(),
            &envelope_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ConfigureBudgetEnvelope {
                owner,
                treasury,
                budget_envelope,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::ConfigureBudgetEnvelope {
                args: ConfigureBudgetEnvelopeArgs {
                    envelope_id,
                    scope_kind: 0,
                    chain: Some(1),
                    tx_type: None,
                    protocol_id: None,
                    daily_limit_usd: 10_000,
                    weekly_limit_usd: 0,
                    now: t0 + 10,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RemoveBudgetEnvelope {
                owner,
                treasury,
                budget_envelope,
            }
            .to_account_metas(None),
            instruction::RemoveBudgetEnvelope {
                envelope_id,
                now: t0 + 11,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .policy_config
            .budget_envelopes
            .envelopes
            .is_empty(),
        "budget envelope not removed"
    );
    println!("[7] remove_budget_envelope (configure -> remove)");

    // 8-10. exposure group: init -> join -> update -> leave -> close.
    let group_id: [u8; 16] = *b"admin-grp-000001";
    let exposure_group = pda(&[b"exposure_group", owner.as_ref(), &group_id], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitExposureGroup {
                authority: owner,
                exposure_group,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitExposureGroup {
                args: InitExposureGroupArgs {
                    group_id,
                    daily_limit_usd: 50_000,
                    now_day: t0,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::JoinExposureGroup {
                authority: owner,
                exposure_group,
                treasury,
            }
            .to_account_metas(None),
            instruction::JoinExposureGroup {}.data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageExposureGroup {
                authority: owner,
                exposure_group,
                treasury,
            }
            .to_account_metas(None),
            instruction::UpdateExposureGroup {
                daily_limit_usd: Some(75_000),
            }
            .data(),
        )],
        &[],
    )?;
    println!("[8] update_exposure_group");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageExposureGroup {
                authority: owner,
                exposure_group,
                treasury,
            }
            .to_account_metas(None),
            instruction::LeaveExposureGroup {}.data(),
        )],
        &[],
    )?;
    println!("[9] leave_exposure_group");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseExposureGroup {
                authority: owner,
                exposure_group,
            }
            .to_account_metas(None),
            instruction::CloseExposureGroup {}.data(),
        )],
        &[],
    )?;
    println!("[10] close_exposure_group (empty)");

    // 11-13. swarm: configure -> init pool -> join -> update -> leave -> close.
    let swarm_id = format!("admin-swarm-{t0}");
    let swarm_pool = pda(&[b"swarm_pool", &swarm_pool_seeds(&swarm_id)], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ConfigureSwarm { owner, treasury }.to_account_metas(None),
            instruction::ConfigureSwarm {
                args: ConfigureSwarmArgs {
                    swarm_id: swarm_id.clone(),
                    member_agents: vec![agent_id.clone()],
                    shared_pool_limit_usd: 100_000,
                    timestamp: t0 + 12,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitSwarmPool {
                creator: owner,
                swarm_pool,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitSwarmPool {
                args: InitSwarmPoolArgs {
                    swarm_id: swarm_id.clone(),
                    shared_pool_limit_usd: 100_000,
                    timestamp: t0 + 13,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::JoinSwarm {
                owner,
                treasury,
                swarm_pool,
            }
            .to_account_metas(None),
            instruction::JoinSwarm { now: t0 + 14 }.data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageSwarm {
                owner,
                treasury,
                swarm_pool,
            }
            .to_account_metas(None),
            instruction::UpdateSwarm {
                shared_pool_limit_usd: 250_000,
                now: t0 + 15,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .swarm
            .as_ref()
            .map(|s| s.shared_pool_limit_usd)
            == Some(250_000),
        "swarm limit not updated"
    );
    println!("[11] update_swarm");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageSwarm {
                owner,
                treasury,
                swarm_pool,
            }
            .to_account_metas(None),
            instruction::LeaveSwarm { now: t0 + 16 }.data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?.swarm.is_none(),
        "swarm not detached after leave"
    );
    println!("[12] leave_swarm");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseSwarmPool {
                creator: owner,
                swarm_pool,
            }
            .to_account_metas(None),
            instruction::CloseSwarmPool {}.data(),
        )],
        &[],
    )?;
    println!("[13] close_swarm_pool (empty)");

    // 14-15. address list: init -> update entry -> clear.
    let address_list = pda(&[b"address_list", treasury.as_ref()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitAddressList {
                owner,
                treasury,
                address_list,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitAddressList {
                mode: 0,
                chain: 1,
                now: t0 + 17,
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageAddressList {
                operator: owner,
                treasury,
                operator_role: None,
                address_list,
            }
            .to_account_metas(None),
            instruction::UpdateAddressListEntry {
                address: "0xabc0000000000000000000000000000000000abc".to_string(),
                add: true,
                now: t0 + 18,
            }
            .data(),
        )],
        &[],
    )?;
    println!("[14] update_address_list_entry");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageAddressList {
                operator: owner,
                treasury,
                operator_role: None,
                address_list,
            }
            .to_account_metas(None),
            instruction::ClearAddressList { now: t0 + 19 }.data(),
        )],
        &[],
    )?;
    println!("[15] clear_address_list");

    // 16. close_external_liveness (setup: init).
    let liveness = pda(&[b"external_liveness", treasury.as_ref()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitExternalLiveness {
                owner,
                treasury,
                liveness,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitExternalLiveness {
                args: InitExternalLivenessArgs {
                    max_staleness_secs: 3_600,
                    now: t0 + 20,
                },
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseExternalLiveness {
                owner,
                treasury,
                liveness,
            }
            .to_account_metas(None),
            instruction::CloseExternalLiveness {}.data(),
        )],
        &[],
    )?;
    println!("[16] close_external_liveness (init -> close)");

    println!("\nall 16 doc-01 instructions verified on devnet.");
    Ok(())
}
