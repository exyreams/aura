use std::{env, str::FromStr};

use anchor_lang::{
    prelude::{system_instruction, system_program::ID as SYSTEM_PROGRAM_ID},
    InstructionData, ToAccountMetas,
};
use anyhow::{anyhow, bail, ensure, Context};
use aura_core::{
    accounts, instruction, ConfirmSettlementArgs, MarkSettlementBroadcastArgs,
    ProposeTransactionArgs, RegisterDwalletArgs, SetRecipientLimitArgs, ID,
};
use aura_policy::{Chain, PolicyConfig, RecipientLimit};
use solana_client::{rpc_client::RpcClient, rpc_request::TokenAccountsFilter};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    message::Message,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
    transaction::Transaction,
};
use spl_token_2022_interface::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    instruction as token_2022_instruction,
    state::{Account as Token2022Account, Mint as Token2022Mint},
};
use spl_token_interface::state::{Account as TokenAccount, Mint};

use crate::{
    activate_treasury, connect_dwallet_client, create_treasury_ix, execute_denied,
    fetch_treasury_domain, finalize_via_dwallet_with_sidecars_result, pda, provision_dwallet,
    register_dwallet_ix, send_tx, transfer_dwallet_authority, FinalizeSidecars, LiveDWallet,
};

pub const DEFAULT_RECIPIENT_OWNER: &str = "HANEmsh97jpuwrAWdqeCigzdquesiYVLxCPpfcPaEe72";
pub const DEFAULT_TRANSFER_UI: &str = "1";
pub const DEFAULT_MAX_TRANSFER_UI: &str = "10";
pub const DEFAULT_DWALLET_BOOTSTRAP_UI: &str = "20";
pub const DEFAULT_MIN_DWALLET_FEE_LAMPORTS: u64 = 20_000_000;

pub const CHAIN_SOLANA: u8 = 2;
pub const TX_TYPE_TRANSFER: u8 = 0;
pub const TX_TYPE_DEFI_SWAP: u8 = 1;

#[derive(Clone, Debug)]
pub struct LiveTokenAsset {
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub payer_token_account: Pubkey,
    pub decimals: u8,
    pub amount: u64,
    pub asset_id: String,
    pub symbol: String,
}

#[derive(Clone, Copy, Debug)]
pub struct DecodedTokenAccount {
    pub mint: Pubkey,
    pub amount: u64,
}

#[derive(Clone, Debug, Default)]
pub struct TokenBalance {
    pub amount: u64,
    pub decimals: u8,
}

#[derive(Debug)]
pub struct TransferResult {
    pub signature: Signature,
    pub destination_ata: Pubkey,
    pub before_source: u64,
    pub after_source: u64,
    pub before_destination: u64,
    pub after_destination: u64,
}

#[derive(Clone, Debug)]
pub struct LivePolicyBasis {
    pub amount_usd: u64,
    pub allowed_per_tx_usd: u64,
    pub default_large_limit_usd: u64,
}

#[derive(Clone, Debug, Default)]
pub struct LivePolicyOverrides {
    pub per_tx_limit_usd: Option<u64>,
    pub daily_limit_usd: Option<u64>,
    pub daytime_hourly_limit_usd: Option<u64>,
    pub nighttime_hourly_limit_usd: Option<u64>,
    pub velocity_limit_usd: Option<u64>,
    pub velocity_limit_equals_amount: bool,
    pub recipient_daily_limit_usd: Option<u64>,
    pub recipient_per_tx_limit_usd: Option<Option<u64>>,
}

#[derive(Clone, Debug, Default)]
pub struct LiveAuraScenarioConfig {
    pub prefix: String,
    pub destination_owner: Option<Pubkey>,
    pub policy_overrides: LivePolicyOverrides,
}

#[derive(Clone, Debug)]
pub struct LiveAuraScenario {
    pub asset: LiveTokenAsset,
    pub agent_id: String,
    pub treasury: Pubkey,
    pub dwallet_state: Pubkey,
    pub live_dwallet: LiveDWallet,
    pub dwallet_program: Pubkey,
    pub dwallet_owner: Pubkey,
    pub source_ata: Pubkey,
    pub destination_owner: Pubkey,
    pub destination_ata: Pubkey,
    pub before_source: TokenBalance,
    pub before_destination: TokenBalance,
    pub amount_raw: u64,
    pub amount_usd: u64,
    pub allowed_per_tx_usd: u64,
}

#[derive(Debug)]
pub struct LiveDwalletTransferResult {
    pub signature: Signature,
    pub before_source: TokenBalance,
    pub after_source: TokenBalance,
    pub before_destination: TokenBalance,
    pub after_destination: TokenBalance,
    pub amount_raw: u64,
    pub amount_usd: u64,
}

pub fn live_token_smoke_enabled() -> bool {
    env::var("AURA_LIVE_TOKEN_SMOKE").ok().as_deref() == Some("1")
        || env::var("AURA_LIVE_SCENARIOS_TEST").ok().as_deref() == Some("1")
        || env::var("AURA_LIVE_FUNDS_TEST").ok().as_deref() == Some("1")
}

pub fn require_live_token_smoke() -> anyhow::Result<()> {
    ensure!(
        live_token_smoke_enabled(),
        "set AURA_LIVE_TOKEN_SMOKE=1 to run token-moving devnet smoke"
    );
    Ok(())
}

pub fn default_recipient_owner() -> anyhow::Result<Pubkey> {
    let value = env::var("AURA_LIVE_RECIPIENT_OWNER")
        .unwrap_or_else(|_| DEFAULT_RECIPIENT_OWNER.to_string());
    Pubkey::from_str(&value).with_context(|| format!("invalid AURA_LIVE_RECIPIENT_OWNER={value}"))
}

pub fn ui_amount_to_raw(ui: &str, decimals: u8) -> anyhow::Result<u64> {
    let trimmed = ui.trim();
    ensure!(!trimmed.is_empty(), "empty UI token amount");
    ensure!(!trimmed.starts_with('-'), "token amount must be positive");
    let (whole, fraction) = trimmed
        .split_once('.')
        .map_or((trimmed, ""), |(whole, fraction)| (whole, fraction));
    ensure!(
        fraction.len() <= decimals as usize,
        "token amount {ui} has more than {decimals} decimal places"
    );
    let scale = 10u128.pow(decimals as u32);
    let whole_raw = whole
        .parse::<u128>()
        .with_context(|| format!("invalid token amount {ui}"))?
        .checked_mul(scale)
        .ok_or_else(|| anyhow!("token amount overflows u64"))?;
    let mut padded = fraction.to_string();
    padded.extend(std::iter::repeat('0').take(decimals as usize - fraction.len()));
    let frac_raw = if padded.is_empty() {
        0
    } else {
        padded
            .parse::<u128>()
            .with_context(|| format!("invalid token amount {ui}"))?
    };
    let raw = whole_raw
        .checked_add(frac_raw)
        .ok_or_else(|| anyhow!("token amount overflows u64"))?;
    u64::try_from(raw).context("token amount overflows u64")
}

pub fn raw_amount_to_ui(raw: u64, decimals: u8) -> String {
    let scale = 10u128.pow(decimals as u32);
    let raw = raw as u128;
    let whole = raw / scale;
    let fraction = raw % scale;
    if fraction == 0 {
        return whole.to_string();
    }
    let mut frac = format!("{fraction:0width$}", width = decimals as usize);
    while frac.ends_with('0') {
        frac.pop();
    }
    format!("{whole}.{frac}")
}

pub fn raw_token_amount_to_usd_cents(raw: u64, decimals: u8) -> u64 {
    let scale = 10u128.pow(decimals as u32);
    ((raw as u128).saturating_mul(100) / scale) as u64
}

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    let mut compact_prefix = String::new();
    for ch in prefix.chars() {
        if compact_prefix.len() + ch.len_utf8() > 16 {
            break;
        }
        compact_prefix.push(ch);
    }
    if compact_prefix.is_empty() {
        compact_prefix.push_str("live");
    }
    format!(
        "{compact_prefix}-{:06}-{}",
        now.rem_euclid(1_000_000),
        &suffix[..8]
    )
}

fn live_policy_config(
    destination_owner: Pubkey,
    basis: &LivePolicyBasis,
    overrides: &LivePolicyOverrides,
) -> PolicyConfig {
    let mut policy = PolicyConfig::default();
    policy.per_tx_limit_usd = overrides
        .per_tx_limit_usd
        .unwrap_or(basis.allowed_per_tx_usd);
    policy.daily_limit_usd = overrides
        .daily_limit_usd
        .unwrap_or(basis.default_large_limit_usd);
    policy.daytime_hourly_limit_usd = overrides
        .daytime_hourly_limit_usd
        .unwrap_or(basis.default_large_limit_usd);
    policy.nighttime_hourly_limit_usd = overrides
        .nighttime_hourly_limit_usd
        .unwrap_or(basis.default_large_limit_usd);
    policy.velocity_limit_usd = if overrides.velocity_limit_equals_amount {
        basis.amount_usd
    } else {
        overrides
            .velocity_limit_usd
            .unwrap_or(basis.default_large_limit_usd)
    };
    policy.max_quote_age_secs = Some(300);
    policy.max_counterparty_risk_score = Some(70);
    let recipient_per_tx = overrides
        .recipient_per_tx_limit_usd
        .unwrap_or_else(|| Some(basis.amount_usd.saturating_sub(1)));
    policy.recipient_limits = vec![RecipientLimit {
        chain: Chain::Solana,
        address: destination_owner.to_string(),
        daily_limit_usd: overrides
            .recipient_daily_limit_usd
            .unwrap_or(basis.default_large_limit_usd),
        per_tx_limit_usd: recipient_per_tx,
    }];
    policy
}

pub async fn prepare_live_aura_scenario(
    rpc: &RpcClient,
    payer: &Keypair,
    mut config: LiveAuraScenarioConfig,
) -> anyhow::Result<LiveAuraScenario> {
    require_live_token_smoke()?;
    if config.prefix.is_empty() {
        config.prefix = "live-scenario".to_string();
    }
    let owner = payer.pubkey();
    let now = crate::now_unix();
    let destination_owner = config
        .destination_owner
        .unwrap_or(default_recipient_owner()?);
    let asset = discover_live_token_asset(rpc, &owner)?;
    let mut dwallet_client = connect_dwallet_client().await?;
    let dwallet_program = Pubkey::from_str(aura_core::DWALLET_DEVNET_PROGRAM_ID)?;
    let live_dwallet = provision_dwallet(rpc, payer, &mut dwallet_client, &dwallet_program).await?;
    let dwallet_owner = dwallet_solana_key(&live_dwallet.public_key)?;
    let source_ata = ensure_token_account(
        rpc,
        payer,
        dwallet_owner,
        asset.mint,
        asset.token_program,
        "dWallet source",
    )?;
    let destination_ata = ensure_token_account(
        rpc,
        payer,
        destination_owner,
        asset.mint,
        asset.token_program,
        "recipient",
    )?;
    ensure_dwallet_fee_payer_lamports(rpc, payer, dwallet_owner)?;
    let before_source =
        bootstrap_dwallet_source_if_needed(rpc, payer, &asset, source_ata, dwallet_owner)?;
    let before_destination = read_token_balance(rpc, &destination_ata)?;
    let amount_raw = pick_transfer_amount_raw(before_source.amount, asset.decimals)?;
    let amount_usd = raw_token_amount_to_usd_cents(amount_raw, asset.decimals);
    ensure!(
        amount_usd > 1,
        "transfer amount maps to too little USD policy value"
    );
    let source_balance_usd = raw_token_amount_to_usd_cents(before_source.amount, asset.decimals);
    let basis = LivePolicyBasis {
        amount_usd,
        allowed_per_tx_usd: amount_usd.saturating_add(100),
        default_large_limit_usd: amount_usd.saturating_mul(100),
    };
    let policy = live_policy_config(destination_owner, &basis, &config.policy_overrides);
    let agent_id = unique_agent_id(&config.prefix, now);
    let treasury = pda(&[b"treasury", owner.as_ref(), agent_id.as_bytes()], &ID).0;
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[CHAIN_SOLANA]], &ID).0;

    println!("\n=== live Aura scenario setup ===");
    println!("payer           : {owner}");
    println!("dWallet owner   : {dwallet_owner}");
    println!("dWallet PDA     : {}", live_dwallet.dwallet_pda);
    println!("mint            : {}", asset.mint);
    println!("token program   : {}", asset.token_program);
    println!("source ATA      : {source_ata}");
    println!("recipient owner : {destination_owner}");
    println!("recipient ATA   : {destination_ata}");
    println!(
        "source before   : {}",
        raw_amount_to_ui(before_source.amount, asset.decimals)
    );
    println!(
        "recipient before: {}",
        raw_amount_to_ui(before_destination.amount, asset.decimals)
    );
    println!(
        "transfer amount : {} ({amount_raw} raw)",
        raw_amount_to_ui(amount_raw, asset.decimals)
    );
    println!("policy amount   : {amount_usd} USD cents");

    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(payer, treasury, &agent_id, now, policy)],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    send_tx(
        rpc,
        payer,
        vec![Instruction {
            data: instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: CHAIN_SOLANA,
                    dwallet_id: live_dwallet.dwallet_pda.to_string(),
                    address: dwallet_owner.to_string(),
                    balance_usd: source_balance_usd,
                    dwallet_account: Some(live_dwallet.dwallet_pda),
                    authorized_user_pubkey: Some(owner),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode(&live_dwallet.public_key)),
                    timestamp: now + 2,
                },
            }
            .data(),
            ..register_dwallet_ix(payer, treasury, &live_dwallet, now + 2)
        }],
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
                chain: CHAIN_SOLANA,
                now: now + 3,
            }
            .data(),
        )],
        &[],
    )?;
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
                chain: CHAIN_SOLANA,
                asset_id: asset.asset_id.clone(),
                symbol: asset.symbol.clone(),
                decimals: asset.decimals,
                native_amount: before_source.amount as u128,
                usd_value: source_balance_usd,
                now: now + 4,
            }
            .data(),
        )],
        &[],
    )?;

    Ok(LiveAuraScenario {
        asset,
        agent_id,
        treasury,
        dwallet_state,
        live_dwallet,
        dwallet_program,
        dwallet_owner,
        source_ata,
        destination_owner,
        destination_ata,
        before_source,
        before_destination,
        amount_raw,
        amount_usd,
        allowed_per_tx_usd: basis.allowed_per_tx_usd,
    })
}

pub fn base_transfer_proposal_args(
    scenario: &LiveAuraScenario,
    now: i64,
) -> ProposeTransactionArgs {
    ProposeTransactionArgs {
        amount_usd: scenario.amount_usd,
        target_chain: CHAIN_SOLANA,
        tx_type: TX_TYPE_TRANSFER,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: Some(scenario.amount_usd),
        actual_output_usd: Some(scenario.amount_usd),
        quote_age_secs: Some(30),
        counterparty_risk_score: Some(10),
        recipient_or_contract: scenario.destination_owner.to_string(),
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

pub fn cancel_pending(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CancelPending {
                owner: payer.pubkey(),
                treasury,
                dwallet_state: None,
            }
            .to_account_metas(None),
            instruction::CancelPending { now }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

pub fn assert_denied_proposal(
    rpc: &RpcClient,
    payer: &Keypair,
    scenario: &LiveAuraScenario,
    label: &str,
    args: ProposeTransactionArgs,
    expected_violation: u8,
    cancel: bool,
) -> anyhow::Result<()> {
    let before_source = read_token_balance(rpc, &scenario.source_ata)?.amount;
    let before_destination = read_token_balance(rpc, &scenario.destination_ata)?.amount;
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: payer.pubkey(),
                treasury: scenario.treasury,
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
    )?;
    let domain = fetch_treasury_domain(rpc, &scenario.treasury)?;
    let denied = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow!("{label} denial did not create pending state"))?;
    ensure!(!denied.decision.approved, "{label} proposal was approved");
    ensure!(
        denied.decision.violation as u8 == expected_violation,
        "{label} violation mismatch: got {:?}, expected {expected_violation}",
        denied.decision.violation
    );
    ensure!(
        read_token_balance(rpc, &scenario.source_ata)?.amount == before_source,
        "{label} moved source funds"
    );
    ensure!(
        read_token_balance(rpc, &scenario.destination_ata)?.amount == before_destination,
        "{label} moved recipient funds"
    );
    if cancel {
        cancel_pending(rpc, payer, scenario.treasury, crate::now_unix())?;
    } else {
        execute_denied(rpc, payer, scenario.treasury, crate::now_unix())?;
    }
    ensure!(
        read_token_balance(rpc, &scenario.source_ata)?.amount == before_source,
        "{label} cleanup moved source funds"
    );
    ensure!(
        read_token_balance(rpc, &scenario.destination_ata)?.amount == before_destination,
        "{label} cleanup moved recipient funds"
    );
    Ok(())
}

pub fn set_recipient_limit(
    rpc: &RpcClient,
    payer: &Keypair,
    scenario: &LiveAuraScenario,
    daily_limit_usd: u64,
    per_tx_limit_usd: Option<u64>,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::OwnerTreasury {
                owner: payer.pubkey(),
                treasury: scenario.treasury,
            }
            .to_account_metas(None),
            instruction::SetRecipientLimit {
                args: SetRecipientLimitArgs {
                    chain: CHAIN_SOLANA,
                    address: scenario.destination_owner.to_string(),
                    daily_limit_usd,
                    per_tx_limit_usd,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

pub fn pick_transfer_amount_raw(balance: u64, decimals: u8) -> anyhow::Result<u64> {
    let default_ui =
        env::var("AURA_LIVE_TRANSFER_UI").unwrap_or_else(|_| DEFAULT_TRANSFER_UI.to_string());
    let max_ui = env::var("AURA_LIVE_MAX_TRANSFER_UI")
        .unwrap_or_else(|_| DEFAULT_MAX_TRANSFER_UI.to_string());
    let one_unit = ui_amount_to_raw(&default_ui, decimals)?;
    let cap = ui_amount_to_raw(&max_ui, decimals)?;
    let one_percent = balance / 100;
    let candidate = one_percent.max(one_unit);
    let amount = candidate.min(cap);
    ensure!(
        amount > 0 && amount < balance,
        "insufficient live token balance: {}",
        raw_amount_to_ui(balance, decimals)
    );
    Ok(amount)
}

pub fn token_ata(mint: &Pubkey, owner: &Pubkey, token_program: &Pubkey) -> Pubkey {
    let associated_token_program = associated_token_program_id();
    Pubkey::find_program_address(
        &[owner.as_ref(), token_program.as_ref(), mint.as_ref()],
        &associated_token_program,
    )
    .0
}

pub fn associated_token_program_id() -> Pubkey {
    Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        .expect("valid associated token program id")
}

fn supported_token_programs() -> [Pubkey; 2] {
    [spl_token_interface::id(), spl_token_2022_interface::id()]
}

fn token_program_label(token_program: &Pubkey) -> &'static str {
    if *token_program == spl_token_2022_interface::id() {
        "Token-2022"
    } else {
        "standard SPL"
    }
}

fn decode_supported_token_account(
    token_program: &Pubkey,
    data: &[u8],
) -> anyhow::Result<DecodedTokenAccount> {
    if *token_program == spl_token_interface::id() {
        let token = TokenAccount::unpack(data).context("failed to decode SPL token account")?;
        return Ok(DecodedTokenAccount {
            mint: token.mint,
            amount: token.amount,
        });
    }
    if *token_program == spl_token_2022_interface::id() {
        let token = StateWithExtensions::<Token2022Account>::unpack(data)
            .context("failed to decode Token-2022 token account")?
            .base;
        return Ok(DecodedTokenAccount {
            mint: token.mint,
            amount: token.amount,
        });
    }
    bail!("unsupported token program {token_program}");
}

fn decode_supported_mint_decimals(
    token_program: &Pubkey,
    mint: &Pubkey,
    data: &[u8],
) -> anyhow::Result<u8> {
    if *token_program == spl_token_interface::id() {
        return Ok(Mint::unpack(data)
            .context("failed to decode SPL token mint")?
            .decimals);
    }
    if *token_program == spl_token_2022_interface::id() {
        let state = StateWithExtensions::<Token2022Mint>::unpack(data)
            .context("failed to decode Token-2022 mint")?;
        let extensions = state
            .get_extension_types()
            .context("failed to decode Token-2022 mint extensions")?;
        ensure!(
            !extensions.contains(&ExtensionType::TransferHook),
            "mint {mint} uses a Token-2022 transfer hook; this smoke helper does not yet supply hook extra accounts"
        );
        ensure!(
            !extensions.contains(&ExtensionType::NonTransferable),
            "mint {mint} is Token-2022 non-transferable"
        );
        return Ok(state.base.decimals);
    }
    bail!("unsupported token program {token_program}");
}

pub fn discover_live_token_assets(
    rpc: &RpcClient,
    owner: &Pubkey,
) -> anyhow::Result<Vec<LiveTokenAsset>> {
    let mut assets = Vec::new();
    for token_program in supported_token_programs() {
        let keyed =
            rpc.get_token_accounts_by_owner(owner, TokenAccountsFilter::ProgramId(token_program))?;
        for account in keyed {
            let token_account = Pubkey::from_str(&account.pubkey)
                .with_context(|| format!("invalid token account pubkey {}", account.pubkey))?;
            let token = read_token_account(rpc, &token_account)?;
            if token.amount == 0 {
                continue;
            }
            let decimals = match read_mint_decimals(rpc, &token.mint) {
                Ok(decimals) => decimals,
                Err(err) => {
                    println!(
                        "  skipping {} mint {}: {err}",
                        token_program_label(&token_program),
                        token.mint
                    );
                    continue;
                }
            };
            assets.push(LiveTokenAsset {
                mint: token.mint,
                token_program,
                payer_token_account: token_account,
                decimals,
                amount: token.amount,
                asset_id: token.mint.to_string(),
                symbol: if token_program == spl_token_2022_interface::id() {
                    "TOKEN2022".to_string()
                } else {
                    "TOKEN".to_string()
                },
            });
        }
    }
    assets.sort_by(|a, b| {
        let left = (a.amount as u128) * 10u128.pow(b.decimals as u32);
        let right = (b.amount as u128) * 10u128.pow(a.decimals as u32);
        right
            .cmp(&left)
            .then_with(|| a.mint.to_string().cmp(&b.mint.to_string()))
    });
    Ok(assets)
}

pub fn discover_live_token_asset(
    rpc: &RpcClient,
    owner: &Pubkey,
) -> anyhow::Result<LiveTokenAsset> {
    let assets = discover_live_token_assets(rpc, owner)?;
    print_token_candidate_report(&assets);
    assets.into_iter().next().ok_or_else(|| {
        anyhow!(
            "payer wallet {owner} has no nonzero transfer-compatible SPL or Token-2022 balances"
        )
    })
}

pub fn print_token_candidate_report(assets: &[LiveTokenAsset]) {
    println!("\n=== live scenario token candidates ===");
    if assets.is_empty() {
        println!("  none found for supported SPL or Token-2022 programs");
    }
    for asset in assets {
        println!(
            "  {} @ {} ({}) [transfer compatible]",
            raw_amount_to_ui(asset.amount, asset.decimals),
            asset.mint,
            token_program_label(&asset.token_program)
        );
    }
}

pub fn read_token_account(
    rpc: &RpcClient,
    token_account: &Pubkey,
) -> anyhow::Result<DecodedTokenAccount> {
    let account = rpc.get_account(token_account)?;
    ensure!(
        supported_token_programs().contains(&account.owner),
        "token account {token_account} is not owned by a supported SPL token program"
    );
    decode_supported_token_account(&account.owner, &account.data)
}

pub fn read_mint_decimals(rpc: &RpcClient, mint: &Pubkey) -> anyhow::Result<u8> {
    let account = rpc.get_account(mint)?;
    ensure!(
        supported_token_programs().contains(&account.owner),
        "mint {mint} is not owned by a supported SPL token program"
    );
    decode_supported_mint_decimals(&account.owner, mint, &account.data)
}

pub fn read_token_balance(rpc: &RpcClient, token_account: &Pubkey) -> anyhow::Result<TokenBalance> {
    match rpc.get_account(token_account) {
        Ok(account) => {
            if !supported_token_programs().contains(&account.owner) {
                bail!("account {token_account} is not a supported SPL token account");
            }
            let token = decode_supported_token_account(&account.owner, &account.data)?;
            let decimals = read_mint_decimals(rpc, &token.mint)?;
            Ok(TokenBalance {
                amount: token.amount,
                decimals,
            })
        }
        Err(_) => Ok(TokenBalance::default()),
    }
}

pub fn ensure_token_account(
    rpc: &RpcClient,
    payer: &Keypair,
    owner: Pubkey,
    mint: Pubkey,
    token_program: Pubkey,
    label: &str,
) -> anyhow::Result<Pubkey> {
    let ata = token_ata(&mint, &owner, &token_program);
    if rpc.get_account(&ata).is_ok() {
        return Ok(ata);
    }
    let ix = create_associated_token_account_ix(payer.pubkey(), ata, owner, mint, token_program);
    let sig = simulate_and_send_ixs(rpc, payer, vec![ix], &format!("create {label} ATA"))?;
    println!("  created {label} ATA {ata} via {sig}");
    Ok(ata)
}

pub fn create_associated_token_account_ix(
    payer: Pubkey,
    ata: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    token_program: Pubkey,
) -> Instruction {
    Instruction {
        program_id: associated_token_program_id(),
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(owner, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            AccountMeta::new_readonly(token_program, false),
        ],
        data: Vec::new(),
    }
}

pub fn transfer_checked_ix(
    asset: &LiveTokenAsset,
    source: Pubkey,
    destination: Pubkey,
    owner: Pubkey,
    amount_raw: u64,
) -> anyhow::Result<Instruction> {
    token_2022_instruction::transfer_checked(
        &asset.token_program,
        &source,
        &asset.mint,
        &destination,
        &owner,
        &[],
        amount_raw,
        asset.decimals,
    )
    .context("failed to build SPL transfer_checked instruction")
}

pub fn transfer_from_payer(
    rpc: &RpcClient,
    payer: &Keypair,
    asset: &LiveTokenAsset,
    destination_owner: Pubkey,
    amount_raw: u64,
    label: &str,
) -> anyhow::Result<TransferResult> {
    require_live_token_smoke()?;
    let destination_ata = ensure_token_account(
        rpc,
        payer,
        destination_owner,
        asset.mint,
        asset.token_program,
        label,
    )?;
    let before_source = read_token_balance(rpc, &asset.payer_token_account)?.amount;
    let before_destination = read_token_balance(rpc, &destination_ata)?.amount;
    let ix = transfer_checked_ix(
        asset,
        asset.payer_token_account,
        destination_ata,
        payer.pubkey(),
        amount_raw,
    )?;
    let signature = simulate_and_send_ixs(rpc, payer, vec![ix], label)?;
    let after_source = read_token_balance(rpc, &asset.payer_token_account)?.amount;
    let after_destination = read_token_balance(rpc, &destination_ata)?.amount;
    Ok(TransferResult {
        signature,
        destination_ata,
        before_source,
        after_source,
        before_destination,
        after_destination,
    })
}

pub fn bootstrap_dwallet_source_if_needed(
    rpc: &RpcClient,
    payer: &Keypair,
    asset: &LiveTokenAsset,
    source_ata: Pubkey,
    source_owner: Pubkey,
) -> anyhow::Result<TokenBalance> {
    require_live_token_smoke()?;
    let before = read_token_balance(rpc, &source_ata)?;
    let one_unit = ui_amount_to_raw(
        &env::var("AURA_LIVE_TRANSFER_UI").unwrap_or_else(|_| DEFAULT_TRANSFER_UI.to_string()),
        asset.decimals,
    )?;
    if before.amount > one_unit {
        return Ok(before);
    }

    let bootstrap_ui = env::var("AURA_LIVE_DWALLET_BOOTSTRAP_UI")
        .unwrap_or_else(|_| DEFAULT_DWALLET_BOOTSTRAP_UI.to_string());
    let bootstrap_raw = ui_amount_to_raw(&bootstrap_ui, asset.decimals)?;
    let top_up = bootstrap_raw.saturating_sub(before.amount);
    ensure!(top_up > 0, "dWallet source is already funded");
    ensure!(
        asset.amount >= top_up,
        "payer token balance {} is below required dWallet bootstrap {}",
        raw_amount_to_ui(asset.amount, asset.decimals),
        raw_amount_to_ui(top_up, asset.decimals)
    );

    println!("\n=== live scenario dWallet funding ===");
    println!("payer ATA       : {}", asset.payer_token_account);
    println!("dWallet owner   : {source_owner}");
    println!("dWallet ATA     : {source_ata}");
    println!(
        "bootstrap amount: {}",
        raw_amount_to_ui(top_up, asset.decimals)
    );

    let ix = transfer_checked_ix(
        asset,
        asset.payer_token_account,
        source_ata,
        payer.pubkey(),
        top_up,
    )?;
    simulate_and_send_ixs(rpc, payer, vec![ix], "bootstrap dWallet token source")?;
    read_token_balance(rpc, &source_ata)
}

pub fn ensure_dwallet_fee_payer_lamports(
    rpc: &RpcClient,
    payer: &Keypair,
    dwallet_solana_key: Pubkey,
) -> anyhow::Result<()> {
    require_live_token_smoke()?;
    let required = env::var("AURA_LIVE_DWALLET_MIN_FEE_LAMPORTS")
        .ok()
        .map(|value| value.parse::<u64>())
        .transpose()
        .context("invalid AURA_LIVE_DWALLET_MIN_FEE_LAMPORTS")?
        .unwrap_or(DEFAULT_MIN_DWALLET_FEE_LAMPORTS);
    let balance = rpc.get_balance(&dwallet_solana_key)?;
    if balance >= required {
        return Ok(());
    }
    let top_up = required - balance;
    simulate_and_send_ixs(
        rpc,
        payer,
        vec![system_instruction::transfer(
            &payer.pubkey(),
            &dwallet_solana_key,
            top_up,
        )],
        "fund dWallet fee payer",
    )?;
    Ok(())
}

pub fn simulate_and_send_ixs(
    rpc: &RpcClient,
    payer: &Keypair,
    ixs: Vec<Instruction>,
    label: &str,
) -> anyhow::Result<Signature> {
    let blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(&ixs, Some(&payer.pubkey()), &[payer], blockhash);
    let simulation = rpc
        .simulate_transaction(&tx)
        .with_context(|| format!("{label} simulation RPC failed"))?;
    if let Some(err) = simulation.value.err {
        bail!(
            "{label} simulation failed: {err:?}\n{}",
            simulation.value.logs.unwrap_or_default().join("\n")
        );
    }
    Ok(rpc.send_and_confirm_transaction(&tx)?)
}

pub fn dwallet_solana_key(public_key: &[u8]) -> anyhow::Result<Pubkey> {
    let bytes: [u8; 32] = public_key
        .try_into()
        .map_err(|_| anyhow!("dWallet public key must be 32 bytes"))?;
    Ok(Pubkey::new_from_array(bytes))
}

pub fn build_dwallet_transfer_transaction(
    rpc: &RpcClient,
    asset: &LiveTokenAsset,
    source_ata: Pubkey,
    destination_ata: Pubkey,
    dwallet_owner: Pubkey,
    amount_raw: u64,
) -> anyhow::Result<(Transaction, [u8; 32], [u8; 32])> {
    let blockhash = rpc.get_latest_blockhash()?;
    let ix = transfer_checked_ix(
        asset,
        source_ata,
        destination_ata,
        dwallet_owner,
        amount_raw,
    )?;
    let message = Message::new_with_blockhash(&[ix], Some(&dwallet_owner), &blockhash);
    let tx = Transaction::new_unsigned(message);
    let recent_blockhash = blockhash.to_bytes();
    let message_hash = compiled_message_digest(&tx);
    Ok((tx, recent_blockhash, message_hash))
}

pub fn compiled_message_digest(tx: &Transaction) -> [u8; 32] {
    solana_keccak_hasher::hash(&tx.message_data()).to_bytes()
}

pub fn attach_dwallet_signature_and_send(
    rpc: &RpcClient,
    mut tx: Transaction,
    dwallet_owner: Pubkey,
    signature_bytes: &[u8],
    label: &str,
) -> anyhow::Result<Signature> {
    ensure!(
        signature_bytes.len() == 64,
        "dWallet returned {}-byte signature; expected 64",
        signature_bytes.len()
    );
    let signature = Signature::try_from(signature_bytes.to_vec())
        .map_err(|_| anyhow!("failed to decode dWallet signature"))?;
    tx.replace_signatures(&[(dwallet_owner, signature)])
        .with_context(|| format!("{label} dWallet signature verification failed"))?;
    let simulation = rpc
        .simulate_transaction(&tx)
        .with_context(|| format!("{label} target transaction simulation RPC failed"))?;
    if let Some(err) = simulation.value.err {
        bail!(
            "{label} target transaction simulation failed: {err:?}\n{}",
            simulation.value.logs.unwrap_or_default().join("\n")
        );
    }
    Ok(rpc.send_and_confirm_transaction(&tx)?)
}

pub async fn execute_approved_live_dwallet_transfer(
    rpc: &RpcClient,
    payer: &Keypair,
    scenario: &LiveAuraScenario,
    label: &str,
) -> anyhow::Result<LiveDwalletTransferResult> {
    require_live_token_smoke()?;
    transfer_dwallet_authority(
        rpc,
        payer,
        &scenario.dwallet_program,
        &scenario.live_dwallet.dwallet_pda,
    )?;

    let before_source = read_token_balance(rpc, &scenario.source_ata)?;
    let before_destination = read_token_balance(rpc, &scenario.destination_ata)?;
    let (target_tx, recent_blockhash, message_hash) = build_dwallet_transfer_transaction(
        rpc,
        &scenario.asset,
        scenario.source_ata,
        scenario.destination_ata,
        scenario.dwallet_owner,
        scenario.amount_raw,
    )?;
    ensure!(
        compiled_message_digest(&target_tx) == message_hash,
        "{label} target transaction digest changed before proposal"
    );
    let now = crate::now_unix();
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: payer.pubkey(),
                treasury: scenario.treasury,
                session_key_account: None,
                swarm_pool: None,
                address_list: None,
                compliance_oracle: None,
                parent_treasury: None,
                budget_envelope: None,
                exposure_group: None,
                dwallet_state: Some(scenario.dwallet_state),
                chain_profile: None,
                trust_identity: None,
                policy_canary: None,
            }
            .to_account_metas(None),
            instruction::ProposeTransaction {
                args: ProposeTransactionArgs {
                    amount_usd: scenario.amount_usd,
                    target_chain: CHAIN_SOLANA,
                    tx_type: TX_TYPE_TRANSFER,
                    protocol_id: None,
                    current_timestamp: now,
                    expected_output_usd: Some(scenario.amount_usd),
                    actual_output_usd: Some(scenario.amount_usd),
                    quote_age_secs: Some(30),
                    counterparty_risk_score: Some(10),
                    recipient_or_contract: scenario.destination_owner.to_string(),
                    sanctions_proof: Vec::new(),
                    asset_id: Some(scenario.asset.asset_id.clone()),
                    native_amount: Some(scenario.amount_raw as u128),
                    decimals: Some(scenario.asset.decimals),
                    gas_native_amount: None,
                    gas_asset_id: None,
                    evm_chain_id: None,
                    replay_nonce: None,
                    gas_limit: None,
                    max_fee_native: None,
                    native_message_hash: Some(message_hash),
                    calldata_hash: None,
                    utxo_set_hash: None,
                    sighash_type: None,
                    solana_recent_blockhash: Some(recent_blockhash),
                    solana_message_hash: Some(message_hash),
                    confirmations_required: Some(1),
                },
            }
            .data(),
        )],
        &[],
    )?;
    let domain = fetch_treasury_domain(rpc, &scenario.treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow!("{label} did not create pending proposal"))?;
    ensure!(pending.decision.approved, "{label} was denied");
    let proposal_id = pending.proposal_id;

    let mut dwallet_client = connect_dwallet_client().await?;
    let finalize = finalize_via_dwallet_with_sidecars_result(
        rpc,
        payer,
        &mut dwallet_client,
        scenario.treasury,
        &scenario.dwallet_program,
        &scenario.live_dwallet,
        now + 1,
        FinalizeSidecars {
            dwallet_state: Some(scenario.dwallet_state),
            signing_message: Some(target_tx.message_data()),
            ..FinalizeSidecars::default()
        },
    )
    .await?;

    let target_signature = attach_dwallet_signature_and_send(
        rpc,
        target_tx,
        scenario.dwallet_owner,
        &finalize.signature,
        label,
    )?;
    println!("  sent {label} target tx: {target_signature}");
    let target_tx_hash = solana_keccak_hasher::hash(target_signature.as_ref()).to_bytes();
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::MarkSettlementBroadcast {
                operator: payer.pubkey(),
                treasury: scenario.treasury,
            }
            .to_account_metas(None),
            instruction::MarkSettlementBroadcast {
                args: MarkSettlementBroadcastArgs {
                    proposal_id,
                    target_tx_hash,
                    now: now + 2,
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
            accounts::ConfirmSettlement {
                operator: payer.pubkey(),
                treasury: scenario.treasury,
                swarm_pool: None,
                budget_envelope: None,
                exposure_group: None,
                dwallet_state: Some(scenario.dwallet_state),
                scheduled_intent: None,
            }
            .to_account_metas(None),
            instruction::ConfirmSettlement {
                args: ConfirmSettlementArgs {
                    proposal_id,
                    target_tx_hash,
                    confirmations_observed: 1,
                    reorged: false,
                    now: now + 3,
                },
            }
            .data(),
        )],
        &[],
    )?;
    let settled = fetch_treasury_domain(rpc, &scenario.treasury)?;
    ensure!(
        settled.pending.is_none(),
        "{label} pending proposal not cleared after settlement"
    );

    let after_source = read_token_balance(rpc, &scenario.source_ata)?;
    let after_destination = read_token_balance(rpc, &scenario.destination_ata)?;
    ensure!(
        before_source.amount - after_source.amount == scenario.amount_raw,
        "{label} source token delta mismatch"
    );
    ensure!(
        after_destination.amount - before_destination.amount == scenario.amount_raw,
        "{label} destination token delta mismatch"
    );
    Ok(LiveDwalletTransferResult {
        signature: target_signature,
        before_source,
        after_source,
        before_destination,
        after_destination,
        amount_raw: scenario.amount_raw,
        amount_usd: scenario.amount_usd,
    })
}
