//! Devnet smoke checks for address-list enforcement.
//!
//! Unlike the `admin` smoke, which only mutates address-list accounts, this
//! suite routes real `propose_transaction` calls through deny-list and
//! allow-list sidecars and verifies the proposal gate hard-reverts or permits
//! as expected.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{accounts, instruction, AddressListAccount, ProposeTransactionArgs, ID};
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
const DENY_MODE: u8 = 0;
const ALLOW_MODE: u8 = 1;
const BLOCKED: &str = "0x00000000000000000000000000000000000000a1";
const ALLOWED: &str = "0x00000000000000000000000000000000000000b2";
const OUTSIDE: &str = "0x00000000000000000000000000000000000000c3";

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

fn fetch_address_list(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<AddressListAccount> {
    let info = rpc.get_account(addr)?;
    Ok(AddressListAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn proposal_args(now: i64, recipient: &str) -> ProposeTransactionArgs {
    ProposeTransactionArgs {
        amount_usd: 100,
        target_chain: ETH,
        tx_type: TRANSFER,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: recipient.to_string(),
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

fn init_list(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    mode: u8,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let owner = payer.pubkey();
    let address_list = pda(&[b"address_list", treasury.as_ref()], &ID).0;
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitAddressList {
                owner,
                treasury,
                address_list,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitAddressList {
                mode,
                chain: ETH,
                now,
            }
            .data(),
        )],
        &[],
    )?;
    Ok(address_list)
}

fn update_entry(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    address_list: Pubkey,
    address: &str,
    add: bool,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ManageAddressList {
                operator: payer.pubkey(),
                treasury,
                operator_role: None,
                address_list,
            }
            .to_account_metas(None),
            instruction::UpdateAddressListEntry {
                address: address.to_string(),
                add,
                now,
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn propose_with_list(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    address_list: Pubkey,
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
                address_list: Some(address_list),
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

fn run_deny_list(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[deny list] blacklisted recipient hard-reverts, removal permits proposal");
    let treasury = create_active_treasury(rpc, payer, "addr-deny", seed)?;
    let address_list = init_list(rpc, payer, treasury, DENY_MODE, seed + 2)?;
    update_entry(rpc, payer, treasury, address_list, BLOCKED, true, seed + 3)?;
    let list = fetch_address_list(rpc, &address_list)?;
    anyhow::ensure!(list.mode == DENY_MODE && list.addresses == vec![BLOCKED]);
    println!("  ok deny list initialized with {BLOCKED}");

    let blocked = propose_with_list(
        rpc,
        payer,
        treasury,
        address_list,
        proposal_args(seed + 4, BLOCKED),
    );
    anyhow::ensure!(
        blocked.is_err(),
        "deny-listed recipient should reject proposal"
    );
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_none(),
        "failed deny-list proposal should not create pending state"
    );
    println!("  ok deny-listed recipient rejected without pending state");

    update_entry(rpc, payer, treasury, address_list, BLOCKED, false, seed + 5)?;
    let list = fetch_address_list(rpc, &address_list)?;
    anyhow::ensure!(list.entry_count == 0, "deny-list entry was not removed");

    propose_with_list(
        rpc,
        payer,
        treasury,
        address_list,
        proposal_args(seed + 6, BLOCKED),
    )?;
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("allowed deny-list proposal did not create pending"))?;
    anyhow::ensure!(pending.decision.approved, "post-removal proposal denied");
    anyhow::ensure!(pending.recipient_or_contract == BLOCKED);
    println!("  ok removed recipient can be proposed again");
    Ok(())
}

fn run_allow_list(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[allow list] outside recipient hard-reverts, listed recipient is accepted");
    let treasury = create_active_treasury(rpc, payer, "addr-allow", seed + 100)?;
    let address_list = init_list(rpc, payer, treasury, ALLOW_MODE, seed + 102)?;
    update_entry(
        rpc,
        payer,
        treasury,
        address_list,
        ALLOWED,
        true,
        seed + 103,
    )?;
    let list = fetch_address_list(rpc, &address_list)?;
    anyhow::ensure!(list.mode == ALLOW_MODE && list.addresses == vec![ALLOWED]);
    println!("  ok allow list initialized with {ALLOWED}");

    let outside = propose_with_list(
        rpc,
        payer,
        treasury,
        address_list,
        proposal_args(seed + 104, OUTSIDE),
    );
    anyhow::ensure!(
        outside.is_err(),
        "outside allow-list recipient should reject proposal"
    );
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_none(),
        "failed allow-list proposal should not create pending state"
    );
    println!("  ok outside recipient rejected without pending state");

    propose_with_list(
        rpc,
        payer,
        treasury,
        address_list,
        proposal_args(seed + 105, ALLOWED),
    )?;
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("listed recipient did not create pending"))?;
    anyhow::ensure!(pending.decision.approved, "allow-listed proposal denied");
    anyhow::ensure!(pending.recipient_or_contract == ALLOWED);
    println!("  ok listed recipient accepted");
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    run_deny_list(&rpc, &payer, seed)?;
    run_allow_list(&rpc, &payer, seed)?;

    println!("\naddress-list enforcement smoke checks passed on devnet.");
    Ok(())
}
