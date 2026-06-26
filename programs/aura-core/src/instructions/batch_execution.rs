//! Create policy-evaluated batch proposal records.
//!
//! Batch proposals let clients pre-check multiple actions as one aggregate
//! request while still preserving per-item violations and approval requirements.

use anchor_lang::prelude::*;
use aura_policy::{evaluate_batch_policy, BatchProposalItem};

use crate::{
    constants::{BATCH_PROPOSAL_SEED, MAX_BATCH_ITEMS, TREASURY_SEED},
    ext_cpi::{
        parse_ciphertext_account, validate_encrypt_u64_vector_ciphertext, AuraEncryptContext,
        ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    },
    program_accounts::{
        chain_from_code, transaction_type_from_code, violation_code, BatchProposalAccount,
        BatchProposalItemRecord, TreasuryAccount, BATCH_PROPOSAL_SPACE,
    },
};

/// One transaction-like item inside a batch proposal.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchProposalItemArgs {
    /// USD amount evaluated for this item.
    pub amount_usd: u64,
    /// Target chain code.
    pub chain: u8,
    /// Transaction type code.
    pub tx_type: u8,
    /// Recipient address or contract identifier.
    pub recipient_or_contract: String,
    /// Optional protocol identifier for protocol-scoped policies.
    pub protocol_id: Option<u8>,
}

/// Instruction data for `propose_batch`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeBatchArgs {
    /// Caller-defined batch identifier used in the batch PDA seed.
    pub batch_id: u64,
    /// Unix timestamp used for policy evaluation and account creation.
    pub now: i64,
    /// Batch items to evaluate in order.
    pub items: Vec<BatchProposalItemArgs>,
}

/// Instruction data for `propose_confidential_batch`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeConfidentialBatchArgs {
    /// Caller-defined batch identifier used in the batch PDA seed.
    pub batch_id: u64,
    /// Unix timestamp used for account creation.
    pub now: i64,
    /// Public number of active lanes at the start of each fixed-width vector.
    pub item_count: u8,
}

#[derive(Accounts)]
#[instruction(args: ProposeBatchArgs)]
pub struct ProposeBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = BATCH_PROPOSAL_SPACE,
        seeds = [BATCH_PROPOSAL_SEED, treasury.key().as_ref(), &args.batch_id.to_le_bytes()],
        bump
    )]
    pub batch: Box<Account<'info, BatchProposalAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: ProposeConfidentialBatchArgs)]
pub struct ProposeConfidentialBatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = BATCH_PROPOSAL_SPACE,
        seeds = [BATCH_PROPOSAL_SEED, treasury.key().as_ref(), &args.batch_id.to_le_bytes()],
        bump
    )]
    pub batch: Box<Account<'info, BatchProposalAccount>>,
    /// CHECK: Encrypt-owned `EUint64Vector` ciphertext with packed item amounts.
    pub amount_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned `EUint64Vector` ciphertext with packed per-item limits.
    pub per_item_limit_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned `EUint64Vector` ciphertext receiving per-item violation flags.
    #[account(mut)]
    pub item_violation_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Official Encrypt program account.
    pub encrypt_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt config account.
    pub config: UncheckedAccount<'info>,
    /// CHECK: Encrypt deposit account.
    #[account(mut)]
    pub deposit: UncheckedAccount<'info>,
    /// CHECK: This program executable account.
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: Encrypt CPI authority PDA derived from this program.
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: Encrypt network encryption key account.
    pub network_encryption_key: UncheckedAccount<'info>,
    /// CHECK: Encrypt event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn propose_batch(ctx: Context<ProposeBatch>, args: ProposeBatchArgs) -> Result<()> {
    require!(!args.items.is_empty(), crate::AuraCoreError::EmptyBatch);
    require!(
        args.items.len() <= MAX_BATCH_ITEMS,
        crate::AuraCoreError::BatchTooLarge
    );
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    let items = args
        .items
        .iter()
        .map(|item| {
            Ok(BatchProposalItem {
                amount_usd: item.amount_usd,
                chain: chain_from_code(item.chain)?,
                tx_type: transaction_type_from_code(item.tx_type)?,
                recipient_or_contract: item.recipient_or_contract.clone(),
                protocol_id: item.protocol_id,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let decision = evaluate_batch_policy(
        &domain.policy_config,
        &domain.policy_state,
        &items,
        args.now,
    );

    let batch = &mut ctx.accounts.batch;
    batch.bump = ctx.bumps.batch;
    batch.treasury = ctx.accounts.treasury.key();
    batch.batch_id = args.batch_id;
    batch.created_at = args.now;
    batch.approved = decision.approved;
    batch.violation_code = violation_code(decision.violation);
    batch.aggregate_amount_usd = decision.aggregate_amount_usd;
    batch.required_approval_level = decision.required_approval_level.code();
    batch.item_count = decision.item_count as u8;
    batch.item_violations = decision
        .item_violations
        .iter()
        .copied()
        .map(violation_code)
        .collect();
    batch.items = args
        .items
        .into_iter()
        .map(|item| BatchProposalItemRecord {
            amount_usd: item.amount_usd,
            chain: item.chain,
            tx_type: item.tx_type,
            recipient_or_contract: item.recipient_or_contract,
            protocol_id: item.protocol_id,
        })
        .collect();
    batch.confidential = false;
    batch.confidential_result_ready = true;
    batch.confidential_item_count = batch.item_count;
    batch.amount_vector_ciphertext = None;
    batch.per_item_limit_vector_ciphertext = None;
    batch.item_violation_vector_ciphertext = None;
    Ok(())
}

pub fn propose_confidential_batch(
    ctx: Context<ProposeConfidentialBatch>,
    args: ProposeConfidentialBatchArgs,
) -> Result<()> {
    require!(args.item_count > 0, crate::AuraCoreError::EmptyBatch);
    require!(
        usize::from(args.item_count) <= MAX_BATCH_ITEMS,
        crate::AuraCoreError::BatchTooLarge
    );

    let expected_encrypt_program: Pubkey = crate::ENCRYPT_DEVNET_PROGRAM_ID
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    require!(
        ctx.accounts.encrypt_program.key() == expected_encrypt_program,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    require!(
        ctx.accounts.caller_program.key() == crate::ID && ctx.accounts.caller_program.executable,
        crate::AuraCoreError::InvalidExternalAccountData
    );

    let (expected_cpi_authority, cpi_authority_bump) =
        Pubkey::find_program_address(&[ENCRYPT_CPI_AUTHORITY_SEED], &crate::ID);
    require!(
        ctx.accounts.cpi_authority.key() == expected_cpi_authority,
        crate::AuraCoreError::InvalidExternalAccountData
    );

    let (expected_event_authority, _) =
        Pubkey::find_program_address(&[ENCRYPT_EVENT_AUTHORITY_SEED], &expected_encrypt_program);
    require!(
        ctx.accounts.event_authority.key() == expected_event_authority,
        crate::AuraCoreError::InvalidExternalAccountData
    );

    validate_ready_u64_vector_ciphertext(
        &ctx.accounts.amount_vector_ciphertext,
        &expected_encrypt_program,
        usize::from(args.item_count),
    )?;
    validate_ready_u64_vector_ciphertext(
        &ctx.accounts.per_item_limit_vector_ciphertext,
        &expected_encrypt_program,
        usize::from(args.item_count),
    )?;
    require!(
        *ctx.accounts.item_violation_vector_ciphertext.owner == expected_encrypt_program,
        crate::AuraCoreError::InvalidExternalAccountData
    );

    let batch = &mut ctx.accounts.batch;
    batch.bump = ctx.bumps.batch;
    batch.treasury = ctx.accounts.treasury.key();
    batch.batch_id = args.batch_id;
    batch.created_at = args.now;
    batch.approved = false;
    batch.violation_code = violation_code(aura_policy::ViolationCode::None);
    batch.aggregate_amount_usd = 0;
    batch.required_approval_level = 0;
    batch.item_count = args.item_count;
    batch.item_violations = Vec::new();
    batch.items = Vec::new();
    batch.confidential = true;
    batch.confidential_result_ready = false;
    batch.confidential_item_count = args.item_count;
    batch.amount_vector_ciphertext = Some(ctx.accounts.amount_vector_ciphertext.key());
    batch.per_item_limit_vector_ciphertext =
        Some(ctx.accounts.per_item_limit_vector_ciphertext.key());
    batch.item_violation_vector_ciphertext =
        Some(ctx.accounts.item_violation_vector_ciphertext.key());

    let encrypt_ctx = AuraEncryptContext {
        encrypt_program: ctx.accounts.encrypt_program.to_account_info(),
        config: ctx.accounts.config.to_account_info(),
        deposit: ctx.accounts.deposit.to_account_info(),
        cpi_authority: ctx.accounts.cpi_authority.to_account_info(),
        caller_program: ctx.accounts.caller_program.to_account_info(),
        network_encryption_key: ctx.accounts.network_encryption_key.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        cpi_authority_bump,
    };

    aura_policy::execute_confidential_batch_item_limit_vector_graph(
        &encrypt_ctx,
        ctx.accounts.amount_vector_ciphertext.to_account_info(),
        ctx.accounts
            .per_item_limit_vector_ciphertext
            .to_account_info(),
        ctx.accounts
            .item_violation_vector_ciphertext
            .to_account_info(),
    )?;

    Ok(())
}

fn validate_ready_u64_vector_ciphertext(
    account: &UncheckedAccount<'_>,
    expected_encrypt_program: &Pubkey,
    active_lanes: usize,
) -> Result<()> {
    require!(
        *account.owner == *expected_encrypt_program,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let data = account.try_borrow_data()?;
    let parsed = parse_ciphertext_account(&data).map_err(crate::map_treasury_error)?;
    validate_encrypt_u64_vector_ciphertext(&parsed, active_lanes)
        .map_err(crate::map_treasury_error)?;
    require!(
        parsed.status == 1,
        crate::AuraCoreError::PolicyOutputNotReady
    );
    Ok(())
}
