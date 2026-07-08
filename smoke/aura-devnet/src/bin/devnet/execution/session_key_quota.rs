//! Devnet smoke checks for session-key proposal scopes.
//!
//! Exercises real `issue_session_key`, session-authorized
//! `propose_transaction`, quota rejection, and revocation rejection. Failed
//! proposals must not consume the session counters.

use anchor_lang::{prelude::system_instruction, system_program::ID as SYSTEM_PROGRAM_ID};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, IssueSessionKeyArgs, ProposeTransactionArgs, SessionKeyAccount, ID,
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

const ETH: u8 = 1;
const TRANSFER: u8 = 0;
const RECIPIENT: &str = "0x0000000000000000000000000000000000000ace";

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

fn fetch_session(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<SessionKeyAccount> {
    let info = rpc.get_account(addr)?;
    Ok(SessionKeyAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn new_session_pair(treasury: Pubkey) -> anyhow::Result<(Keypair, Pubkey)> {
    for _ in 0..256 {
        let signer = Keypair::new();
        if let Some((session_account, _)) = Pubkey::try_find_program_address(
            &[b"session_key", treasury.as_ref(), signer.pubkey().as_ref()],
            &ID,
        ) {
            return Ok((signer, session_account));
        }
    }

    anyhow::bail!("failed to derive viable session-key PDA");
}

fn proposal_args(now: i64, amount_usd: u64) -> ProposeTransactionArgs {
    ProposeTransactionArgs {
        amount_usd,
        target_chain: ETH,
        tx_type: TRANSFER,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: RECIPIENT.to_string(),
        sanctions_proof: Vec::new(),
        asset_id: None,
        native_amount: None,
        decimals: None,
        gas_native_amount: None,
        gas_asset_id: None,
        evm_chain_id: None,
        replay_nonce: None,
        gas_limit: None,
        max_fee_native: None,
        native_message_hash: None,
        calldata_hash: None,
        utxo_set_hash: None,
        sighash_type: None,
        solana_recent_blockhash: None,
        solana_message_hash: None,
        confirmations_required: None,
    }
}

fn fund_session_signer(rpc: &RpcClient, payer: &Keypair, signer: &Keypair) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![system_instruction::transfer(
            &payer.pubkey(),
            &signer.pubkey(),
            1_000_000,
        )],
        &[],
    )
    .map(|_| ())
}

#[allow(clippy::too_many_arguments)]
fn issue_session_key(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    session_signer: &Keypair,
    session_key_account: Pubkey,
    max_proposal_count: Option<u32>,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::IssueSessionKey {
                authority: payer.pubkey(),
                treasury,
                session_key_account,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::IssueSessionKey {
                args: IssueSessionKeyArgs {
                    session_key: session_signer.pubkey(),
                    duration_secs: 3_600,
                    max_amount_usd_per_tx: Some(150),
                    max_daily_spend_usd: Some(250),
                    allowed_chains: vec![ETH],
                    allowed_tx_types: vec![TRANSFER],
                    max_proposal_count,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn propose_with_session(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    session_signer: &Keypair,
    session_key_account: Pubkey,
    args: ProposeTransactionArgs,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: session_signer.pubkey(),
                treasury,
                session_key_account: Some(session_key_account),
                swarm_pool: None,
                address_list: None,
                compliance_oracle: None,
                parent_treasury: None,
                budget_envelope: None,
                exposure_group: None,
                dwallet_state: None,
                chain_profile: None,
                trust_identity: None,
                policy_canary: None,
            }
            .to_account_metas(None),
            instruction::ProposeTransaction { args }.data(),
        )],
        &[session_signer],
    )
    .map(|_| ())
}

fn revoke_session_key(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    session_key_account: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RevokeSessionKey {
                authority: payer.pubkey(),
                treasury,
                session_key_account,
            }
            .to_account_metas(None),
            instruction::RevokeSessionKey { now }.data(),
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

    let treasury = create_active_treasury(&rpc, &payer, "session-quota", seed)?;

    println!("\n[session quota] first scoped proposal consumes counters");
    let (session_signer, session_key_account) = new_session_pair(treasury)?;
    fund_session_signer(&rpc, &payer, &session_signer)?;
    issue_session_key(
        &rpc,
        &payer,
        treasury,
        &session_signer,
        session_key_account,
        Some(1),
        seed + 2,
    )?;
    propose_with_session(
        &rpc,
        &payer,
        treasury,
        &session_signer,
        session_key_account,
        proposal_args(seed + 3, 100),
    )?;
    let session = fetch_session(&rpc, &session_key_account)?;
    anyhow::ensure!(
        session.proposals_submitted == 1,
        "proposal counter not incremented"
    );
    anyhow::ensure!(
        session.session_spent_today_usd == 100,
        "session spend counter not incremented"
    );
    let pending = fetch_treasury_domain(&rpc, &treasury)?
        .pending
        .ok_or_else(|| anyhow::anyhow!("session proposal did not create pending state"))?;
    anyhow::ensure!(pending.proposal_id == 1, "unexpected first proposal id");
    anyhow::ensure!(pending.amount_usd == 100, "pending amount mismatch");
    anyhow::ensure!(
        pending.recipient_or_contract == RECIPIENT,
        "pending recipient mismatch"
    );
    anyhow::ensure!(
        pending.decision.approved,
        "session proposal was not approved"
    );
    println!("  ok first proposal recorded counters and pending state");

    println!("\n[session quota] over-quota proposal rejects without counter mutation");
    let over_quota = propose_with_session(
        &rpc,
        &payer,
        treasury,
        &session_signer,
        session_key_account,
        proposal_args(seed + 4, 100),
    );
    anyhow::ensure!(
        over_quota.is_err(),
        "second session proposal should exceed quota"
    );
    let session = fetch_session(&rpc, &session_key_account)?;
    anyhow::ensure!(
        session.proposals_submitted == 1,
        "failed proposal consumed quota"
    );
    anyhow::ensure!(
        session.session_spent_today_usd == 100,
        "failed proposal consumed spend"
    );
    println!("  ok failed quota proposal left counters unchanged");

    println!("\n[session revoke] revoked session rejects future proposals");
    let (revoked_signer, revoked_session) = new_session_pair(treasury)?;
    fund_session_signer(&rpc, &payer, &revoked_signer)?;
    issue_session_key(
        &rpc,
        &payer,
        treasury,
        &revoked_signer,
        revoked_session,
        Some(2),
        seed + 5,
    )?;
    revoke_session_key(&rpc, &payer, treasury, revoked_session, seed + 6)?;
    let revoked = fetch_session(&rpc, &revoked_session)?;
    anyhow::ensure!(revoked.revoked, "session key was not marked revoked");
    let revoked_proposal = propose_with_session(
        &rpc,
        &payer,
        treasury,
        &revoked_signer,
        revoked_session,
        proposal_args(seed + 7, 50),
    );
    anyhow::ensure!(
        revoked_proposal.is_err(),
        "revoked session should reject proposal"
    );
    let revoked = fetch_session(&rpc, &revoked_session)?;
    anyhow::ensure!(
        revoked.proposals_submitted == 0 && revoked.session_spent_today_usd == 0,
        "revoked failed proposal mutated counters"
    );
    println!("  ok revoked session rejected without counter mutation");

    println!("\nsession-key quota smoke checks passed on devnet.");
    Ok(())
}
