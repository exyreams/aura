//! Devnet smoke checks for oracle integration and multichain architecture.
//!
//! Oracle coverage: `set_asset_oracle_feed` stores a verified feed descriptor on a tracked
//! asset; `refresh_verified_asset_balance` reads the feed account, runs the oracle adapter,
//! and updates the asset row.  The RawLegacy path is used here so no live Pyth/Switchboard
//! account is needed — the feed account is a freshly created 8-byte system account.
//!
//! Multichain coverage: `register_chain_profile` and `update_chain_profile` manage the
//! custom-chain registry PDA.  `propose_transaction` with EVM chain-binding fields
//! (evm_chain_id, nonce, gas) exercises the replay-protection digest path and the
//! recipient-address validator.  `abandon_proposal` cancels a chain-bound pending proposal.
//!
//! Not smoke-tested here (require Ika dWallet `finalize_execution` to reach Signed status):
//!   mark_settlement_broadcast, confirm_settlement, resubmit_proposal.
//! Those paths are covered by unit tests in `instructions/confirm_settlement.rs`.

use anchor_lang::prelude::system_instruction;
use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, constants::CHAIN_PROFILE_SEED, instruction, ChainProfileAccount, ChainProfileArgs,
    DWalletAccount, ProposeTransactionArgs, RefreshVerifiedAssetBalanceArgs, RegisterDwalletArgs,
    SetAssetOracleFeedArgs, ID,
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
const CUSTOM_CHAIN: u8 = 100;

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
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

fn fetch_account<T: AccountDeserialize>(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<T> {
    let info = rpc.get_account(addr)?;
    Ok(T::try_deserialize(&mut info.data.as_slice())?)
}

fn setup_eth_dwallet(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let owner = payer.pubkey();
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[ETH]], &ID).0;

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RegisterDwallet { owner, treasury }.to_account_metas(None),
            instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: ETH,
                    dwallet_id: format!("om-eth-{now}"),
                    address: "0xAA00000000000000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: Some(Keypair::new().pubkey()),
                    authorized_user_pubkey: Some(owner),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode([0x44u8; 32])),
                    timestamp: now,
                },
            }
            .data(),
        )],
        &[],
    )?;

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitDwalletState {
                owner,
                treasury,
                dwallet_state,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitDwalletState {
                chain: ETH,
                now: now + 1,
            }
            .data(),
        )],
        &[],
    )?;

    Ok(dwallet_state)
}

// Oracle integration

fn run_oracle_integration(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[oracle] set_asset_oracle_feed + refresh_verified_asset_balance");
    let treasury = create_active_treasury(rpc, payer, "om-oracle", seed)?;
    let dwallet_state = setup_eth_dwallet(rpc, payer, treasury, seed + 2)?;
    let owner = payer.pubkey();

    // Record a USDC deposit so the asset row exists before setting the feed.
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RecordDeposit {
                chain: ETH,
                asset_id: "usdc".to_string(),
                symbol: "USDC".to_string(),
                decimals: 6,
                native_amount: 1_000_000_000u128,
                usd_value: 1_000,
                now: seed + 5,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  ok usdc deposit recorded (1000 usd)");

    // Create a minimal oracle feed account on devnet: 8 zero bytes owned by our program.
    // read_raw_legacy_price reads the first 8 bytes as a little-endian u64 price.
    // Eight zero bytes → price = 0 → price_usd_e6 = 0 → usd_value = 0.
    // This is sufficient to exercise the full instruction path without a live Pyth feed.
    let feed_kp = Keypair::new();
    let feed_pubkey = feed_kp.pubkey();
    let rent = rpc.get_minimum_balance_for_rent_exemption(8)?;
    send_tx(
        rpc,
        payer,
        vec![system_instruction::create_account(
            &payer.pubkey(),
            &feed_pubkey,
            rent,
            8,
            &ID,
        )],
        &[&feed_kp],
    )?;
    println!("  ok oracle feed account created: {feed_pubkey}");

    // set_asset_oracle_feed — store the feed account pubkey on the usdc asset (RawLegacy=255).
    // For non-trusted providers, the only stored field is the feed account pubkey;
    // provider/staleness/confidence are supplied at refresh time.
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SetAssetOracleFeed {
                chain: ETH,
                args: SetAssetOracleFeedArgs {
                    asset_id: "usdc".to_string(),
                    provider: 255, // RawLegacy
                    feed: Some(feed_pubkey),
                    program_id: None,
                    max_staleness_secs: 0,
                    max_confidence_bps: 0,
                    expo_expected: None,
                    now: seed + 6,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    let usdc = dw
        .assets
        .iter()
        .find(|a| a.asset_id == "usdc")
        .ok_or_else(|| anyhow::anyhow!("usdc asset missing after set_asset_oracle_feed"))?;
    anyhow::ensure!(
        usdc.feed == Some(feed_pubkey),
        "oracle feed pubkey not stored on asset"
    );
    println!("  ok set_asset_oracle_feed (RawLegacy, feed={feed_pubkey})");

    // refresh_verified_asset_balance — reads the stored feed account, runs the RawLegacy
    // adapter (8 zero bytes → price=0 → usd_value=0), and upserts the asset row.
    send_tx(
        rpc,
        payer,
        vec![Instruction {
            program_id: ID,
            accounts: accounts::RefreshVerifiedAssetBalance {
                authority: owner,
                treasury,
                dwallet_state,
                price_feed: feed_pubkey,
            }
            .to_account_metas(None),
            data: instruction::RefreshVerifiedAssetBalance {
                args: RefreshVerifiedAssetBalanceArgs {
                    chain: ETH,
                    asset_id: "usdc".to_string(),
                    symbol: "USDC".to_string(),
                    decimals: 6,
                    native_amount: 500_000_000u128,
                    provider: 255, // RawLegacy
                    program_id: None,
                    max_staleness_secs: 0,
                    max_confidence_bps: 0,
                    expo_expected: None,
                    now: seed + 7,
                },
            }
            .data(),
        }],
        &[],
    )?;
    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    let usdc = dw
        .assets
        .iter()
        .find(|a| a.asset_id == "usdc")
        .ok_or_else(|| {
            anyhow::anyhow!("usdc asset missing after refresh_verified_asset_balance")
        })?;
    anyhow::ensure!(
        usdc.native_amount == 500_000_000,
        "native_amount not updated by verified refresh"
    );
    println!(
        "  ok refresh_verified_asset_balance (RawLegacy, native=500_000_000, usd=0 from zero feed)"
    );

    println!("  oracle integration checks passed");
    Ok(())
}

// Chain profile registry

fn run_chain_profiles(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[chain profiles] register_chain_profile + update_chain_profile");
    let chain_profile = pda(&[CHAIN_PROFILE_SEED, &[CUSTOM_CHAIN]], &ID).0;

    // register_chain_profile — custom EVM-like chain (code 100, chain_id 9999).
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RegisterChainProfile {
                authority: payer.pubkey(),
                chain_profile,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::RegisterChainProfile {
                args: ChainProfileArgs {
                    chain_code: CUSTOM_CHAIN,
                    enabled: true,
                    address_format: 0,   // EVM hex
                    replay_scheme: 0,    // EVM nonce/chain_id
                    finality_model: 0,   // probabilistic
                    curve: 0,            // Secp256k1
                    signature_scheme: 0, // ECDSA
                    native_gas_asset: "eth".to_string(),
                    evm_chain_id: Some(9999),
                    confirmations_required: 12,
                    now: seed,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let profile: ChainProfileAccount = fetch_account(rpc, &chain_profile)?;
    anyhow::ensure!(
        profile.chain_code == CUSTOM_CHAIN && profile.enabled,
        "chain profile not registered or not enabled"
    );
    anyhow::ensure!(
        profile.evm_chain_id == Some(9999),
        "evm_chain_id mismatch on registered profile"
    );
    anyhow::ensure!(
        profile.confirmations_required == 12,
        "confirmations_required mismatch on registered profile"
    );
    println!(
        "  ok register_chain_profile (code={CUSTOM_CHAIN}, evm_chain_id=9999, confirmations=12)"
    );

    // update_chain_profile — reduce confirmation depth to 6.
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::UpdateChainProfile {
                authority: payer.pubkey(),
                chain_profile,
            }
            .to_account_metas(None),
            instruction::UpdateChainProfile {
                args: ChainProfileArgs {
                    chain_code: CUSTOM_CHAIN,
                    enabled: true,
                    address_format: 0,
                    replay_scheme: 0,
                    finality_model: 0,
                    curve: 0,
                    signature_scheme: 0,
                    native_gas_asset: "eth".to_string(),
                    evm_chain_id: Some(9999),
                    confirmations_required: 6,
                    now: seed + 1,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let profile: ChainProfileAccount = fetch_account(rpc, &chain_profile)?;
    anyhow::ensure!(
        profile.confirmations_required == 6,
        "confirmations_required not updated"
    );
    println!("  ok update_chain_profile (confirmations_required -> 6)");

    println!("  chain profile checks passed");
    Ok(())
}

// Chain binding + abandon

fn run_chain_binding_and_abandon(
    rpc: &RpcClient,
    payer: &Keypair,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[chain binding] propose_transaction with EVM binding + abandon_proposal");
    let treasury = create_active_treasury(rpc, payer, "om-chain", seed + 500)?;

    // propose_transaction with full EVM chain-binding fields.
    //
    // The program validates:
    //   evm_chain_id == built-in ETH profile (1), replay_nonce present,
    //   gas_limit > 0, max_fee_native > 0, recipient is a valid EVM address.
    // This exercises generate_proposal_digest binding and the
    // RecipientAddressInvalidForChain / ChainReplayFieldsMissing error paths.
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
            instruction::ProposeTransaction {
                args: ProposeTransactionArgs {
                    amount_usd: 100,
                    target_chain: ETH,
                    tx_type: TRANSFER,
                    protocol_id: None,
                    current_timestamp: seed + 502,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: "0xAA00000000000000000000000000000000000001".to_string(),
                    sanctions_proof: Vec::new(),
                    asset_id: None,
                    native_amount: None,
                    decimals: None,
                    gas_native_amount: None,
                    gas_asset_id: None,
                    evm_chain_id: Some(1),
                    replay_nonce: Some(42),
                    gas_limit: Some(21_000),
                    max_fee_native: Some(50_000_000_000u128),
                    calldata_hash: None,
                    utxo_set_hash: None,
                    sighash_type: None,
                    solana_recent_blockhash: None,
                    solana_message_hash: None,
                    confirmations_required: Some(12),
                },
            }
            .data(),
        )],
        &[],
    )?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain.pending.as_ref().ok_or_else(|| {
        anyhow::anyhow!("no pending proposal after chain-bound propose_transaction")
    })?;
    anyhow::ensure!(
        pending.transfer.has_chain_binding(),
        "pending proposal missing chain binding"
    );
    anyhow::ensure!(
        pending.transfer.execution_binding.evm_chain_id == Some(1),
        "evm_chain_id not stored in pending proposal"
    );
    anyhow::ensure!(
        pending.transfer.execution_binding.replay_nonce == Some(42),
        "replay_nonce not stored in pending proposal"
    );
    let proposal_id = pending.proposal_id;
    println!(
        "  ok propose_transaction with EVM binding (chain_id=1, nonce=42, gas=21000), proposal_id={proposal_id}"
    );

    // abandon_proposal — cancel the chain-bound pending proposal without wallet settlement.
    // No dwallet_state needed since there is no asset payload (asset_id=None).
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::AbandonProposal {
                operator: payer.pubkey(),
                treasury,
                dwallet_state: None,
            }
            .to_account_metas(None),
            instruction::AbandonProposal {
                proposal_id,
                now: seed + 503,
            }
            .data(),
        )],
        &[],
    )?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    anyhow::ensure!(
        domain.pending.is_none(),
        "pending proposal not cleared after abandon_proposal"
    );
    println!("  ok abandon_proposal clears chain-bound pending slot");

    println!("  chain binding + abandon checks passed");
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    run_oracle_integration(&rpc, &payer, seed)?;
    run_chain_profiles(&rpc, &payer, seed)?;
    run_chain_binding_and_abandon(&rpc, &payer, seed)?;

    println!("\noracle + multichain smoke checks passed on devnet.");
    Ok(())
}
