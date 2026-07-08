//! Devnet smoke checks for operator-scoped pause controls.
//!
//! This suite validates the operator role permission path and the real
//! `propose_transaction` policy outcome for scoped pauses. Matching proposals
//! are denied by policy and remain inspectable on-chain; unrelated scopes stay
//! approved. A revoked operator role must not be able to mutate the pause list.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, role_permissions, GrantOperatorRoleArgs, OperatorRoleAccount,
    ProposeTransactionArgs, SetScopedPauseArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use aura_policy::{PauseScope, ViolationCode};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const SOLANA: u8 = 2;
const TRANSFER: u8 = 0;
const CHAIN_SCOPE: u8 = 1;
const RECIPIENT: &str = "0x0000000000000000000000000000000000000def";

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

fn fetch_operator_role(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<OperatorRoleAccount> {
    let info = rpc.get_account(addr)?;
    Ok(OperatorRoleAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn proposal_args(now: i64, target_chain: u8) -> ProposeTransactionArgs {
    ProposeTransactionArgs {
        amount_usd: 100,
        target_chain,
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

fn grant_scoped_pause_operator(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    operator: Pubkey,
    operator_role: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::GrantOperatorRole {
                owner: payer.pubkey(),
                operator,
                treasury,
                operator_role,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::GrantOperatorRole {
                args: GrantOperatorRoleArgs {
                    permission_mask: role_permissions::MANAGE_SCOPED_PAUSE,
                    expires_at: now + 3_600,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn set_chain_pause(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    operator: &Keypair,
    operator_role: Pubkey,
    paused: bool,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::SetScopedPause {
                operator: operator.pubkey(),
                treasury,
                operator_role: Some(operator_role),
            }
            .to_account_metas(None),
            instruction::SetScopedPause {
                args: SetScopedPauseArgs {
                    scope_kind: CHAIN_SCOPE,
                    chain: Some(ETH),
                    tx_type: None,
                    recipient: None,
                    protocol_id: None,
                    paused,
                    expires_at: Some(now + 3_600),
                    now,
                },
            }
            .data(),
        )],
        &[operator],
    )
    .map(|_| ())
}

fn propose(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    args: ProposeTransactionArgs,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: payer.pubkey(),
                treasury,
                session_key_account: None,
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
        &[],
    )
    .map(|_| ())
}

fn revoke_operator_role(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    operator_role: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RevokeOperatorRole {
                owner: payer.pubkey(),
                treasury,
                operator_role,
            }
            .to_account_metas(None),
            instruction::RevokeOperatorRole { now }.data(),
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

    let treasury = create_active_treasury(&rpc, &payer, "operator-pause", seed)?;
    let operator = Keypair::new();
    let operator_role = pda(
        &[
            b"operator_role",
            treasury.as_ref(),
            operator.pubkey().as_ref(),
        ],
        &ID,
    )
    .0;

    println!("\n[operator role] grant narrow scoped-pause permission");
    grant_scoped_pause_operator(
        &rpc,
        &payer,
        treasury,
        operator.pubkey(),
        operator_role,
        seed + 2,
    )?;
    let role = fetch_operator_role(&rpc, &operator_role)?;
    anyhow::ensure!(
        role.operator == operator.pubkey()
            && role.permission_mask == role_permissions::MANAGE_SCOPED_PAUSE
            && !role.revoked,
        "operator role grant did not persist expected permission"
    );
    println!("  ok operator role granted");

    println!("\n[scoped pause] operator pauses Ethereum transfer scope");
    set_chain_pause(
        &rpc,
        &payer,
        treasury,
        &operator,
        operator_role,
        true,
        seed + 3,
    )?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let pause = domain
        .policy_config
        .scoped_pause
        .entries
        .first()
        .ok_or_else(|| anyhow::anyhow!("scoped pause entry not recorded"))?;
    anyhow::ensure!(
        matches!(pause.scope, PauseScope::Chain { .. })
            && pause.paused_by == operator.pubkey().to_string(),
        "scoped pause entry mismatch"
    );
    println!("  ok scoped pause recorded");

    println!("\n[policy outcome] paused scope is denied, unrelated chain is approved");
    propose(&rpc, &payer, treasury, proposal_args(seed + 4, ETH))?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let paused_pending = domain
        .pending_queue
        .last()
        .ok_or_else(|| anyhow::anyhow!("paused proposal did not create pending state"))?;
    anyhow::ensure!(
        !paused_pending.decision.approved
            && paused_pending.decision.violation == ViolationCode::ExecutionScopePaused,
        "paused-scope proposal did not record ExecutionScopePaused denial"
    );

    propose(&rpc, &payer, treasury, proposal_args(seed + 5, SOLANA))?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let allowed_pending = domain
        .pending_queue
        .last()
        .ok_or_else(|| anyhow::anyhow!("unrelated proposal did not create pending state"))?;
    anyhow::ensure!(
        allowed_pending.decision.approved
            && allowed_pending.target_chain == aura_policy::Chain::Solana,
        "unrelated proposal should remain approved"
    );
    println!("  ok scoped policy decision is precise");

    println!("\n[revocation] revoked operator cannot mutate scoped pause");
    revoke_operator_role(&rpc, &payer, treasury, operator_role, seed + 6)?;
    let role = fetch_operator_role(&rpc, &operator_role)?;
    anyhow::ensure!(role.revoked, "operator role was not marked revoked");
    let entries_before = fetch_treasury_domain(&rpc, &treasury)?
        .policy_config
        .scoped_pause
        .entries
        .len();
    let revoked_attempt = set_chain_pause(
        &rpc,
        &payer,
        treasury,
        &operator,
        operator_role,
        false,
        seed + 7,
    );
    anyhow::ensure!(
        revoked_attempt.is_err(),
        "revoked operator should not mutate scoped pause"
    );
    let entries_after = fetch_treasury_domain(&rpc, &treasury)?
        .policy_config
        .scoped_pause
        .entries
        .len();
    anyhow::ensure!(
        entries_after == entries_before,
        "revoked operator mutation changed scoped pause entries"
    );
    println!("  ok revoked operator rejected without state mutation");

    println!("\noperator-role scoped-pause smoke checks passed on devnet.");
    Ok(())
}
