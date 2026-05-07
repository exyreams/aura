use anchor_lang::prelude::*;
use aura_policy::{PauseScope, TransactionContext};

use crate::{
    constants::TREASURY_SEED,
    ext_cpi::{parse_ciphertext_account, ENCRYPT_FHE_VECTOR_U64},
    instructions::{
        propose_confidential_transaction::ProposeConfidentialTransactionArgs, sync_treasury_account,
    },
    program_accounts::{
        chain_from_code, transaction_type_from_code, ExternalLivenessAccount, TreasuryAccount,
    },
};

#[derive(Accounts)]
pub struct ProposeConfidentialVectorTransaction<'info> {
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.ai_authority == ai_authority.key() @ crate::AuraCoreError::UnauthorizedAi
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: Encrypt-owned ciphertext account containing [remaining_daily_limit, per_tx_limit, spent_today].
    pub guardrail_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with `[-amount mod u64, 0, amount]`.
    pub spend_delta_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with `[amount, amount]` for limit checks.
    pub comparison_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with assign target lanes `[3, 4, 5, ...]`.
    pub flag_indices_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Pre-allocated Encrypt-owned output vector ciphertext account.
    ///
    /// Vector outputs must already be `EUint64Vector` ciphertext accounts. The
    /// pre-alpha Encrypt runtime preserves that account type when the graph
    /// overwrites the digest, avoiding the scalar default used for fresh signer
    /// output accounts.
    pub policy_result_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Official Encrypt program account.
    pub encrypt_program: UncheckedAccount<'info>,
    pub external_liveness: Option<Box<Account<'info, ExternalLivenessAccount>>>,
}

/// Proposes a confidential vector FHE transaction.
///
/// Like `propose_confidential_transaction` but uses the vector FHE graph
/// which takes a single `EUint64Vector` guardrail ciphertext encoding
/// `[remaining_daily_limit, per_tx_limit, spent_today]` and produces a result
/// vector encoding `[next_remaining_daily_limit, per_tx_limit,
/// next_spent_today, daily_exceeded, per_tx_exceeded]`.
///
/// This instruction only persists the pending proposal. The expensive Encrypt
/// graph CPI runs in `execute_pending_vector_fhe`, giving vector execution a
/// fresh BPF heap frame instead of sharing the proposal serialization heap.
pub fn handler(
    ctx: Context<ProposeConfidentialVectorTransaction>,
    args: ProposeConfidentialTransactionArgs,
) -> Result<()> {
    require!(
        !scoped_dependency_paused(
            &ctx.accounts.treasury.policy_config,
            PauseScope::ConfidentialExecution,
            args.current_timestamp,
        ),
        crate::AuraCoreError::ExecutionScopePaused
    );
    if ctx
        .accounts
        .treasury
        .policy_config
        .liveness_config
        .require_encrypt_freshness
    {
        let liveness = ctx
            .accounts
            .external_liveness
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::ExternalDependencyStale))?;
        require!(
            liveness.treasury == ctx.accounts.treasury.key(),
            crate::AuraCoreError::InvalidExternalAccountData
        );
        liveness.require_encrypt_fresh(args.current_timestamp)?;
    }
    let guardrails = ctx
        .accounts
        .treasury
        .confidential_guardrails
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?;
    let expected_encrypt_program: Pubkey = crate::ENCRYPT_DEVNET_PROGRAM_ID
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if ctx.accounts.encrypt_program.key() != expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    validate_u64_vector_ciphertext(
        &ctx.accounts.guardrail_vector_ciphertext,
        &expected_encrypt_program,
    )?;
    validate_u64_vector_ciphertext(
        &ctx.accounts.spend_delta_vector_ciphertext,
        &expected_encrypt_program,
    )?;
    validate_u64_vector_ciphertext(
        &ctx.accounts.comparison_vector_ciphertext,
        &expected_encrypt_program,
    )?;
    validate_u64_vector_ciphertext(
        &ctx.accounts.flag_indices_vector_ciphertext,
        &expected_encrypt_program,
    )?;
    validate_u64_vector_ciphertext(
        &ctx.accounts.policy_result_vector_ciphertext,
        &expected_encrypt_program,
    )?;

    if Some(ctx.accounts.guardrail_vector_ciphertext.key())
        != guardrails.guardrail_vector_ciphertext
    {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let tx = TransactionContext {
        amount_usd: args.amount_usd,
        target_chain: chain_from_code(args.target_chain)?,
        tx_type: transaction_type_from_code(args.tx_type)?,
        protocol_id: args.protocol_id,
        current_timestamp: args.current_timestamp,
        expected_output_usd: args.expected_output_usd,
        actual_output_usd: args.actual_output_usd,
        quote_age_secs: args.quote_age_secs,
        counterparty_risk_score: args.counterparty_risk_score,
        recipient_or_contract: Some(args.recipient_or_contract.clone()),
    };

    let guardrail_vector_ciphertext_account =
        ctx.accounts.guardrail_vector_ciphertext.key().to_string();
    let spend_delta_vector_ciphertext_account =
        ctx.accounts.spend_delta_vector_ciphertext.key().to_string();
    let comparison_vector_ciphertext_account =
        ctx.accounts.comparison_vector_ciphertext.key().to_string();
    let flag_indices_vector_ciphertext_account = ctx
        .accounts
        .flag_indices_vector_ciphertext
        .key()
        .to_string();
    let policy_output_ciphertext_account = ctx
        .accounts
        .policy_result_vector_ciphertext
        .key()
        .to_string();
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    crate::propose_confidential_vector_transaction(
        &mut domain,
        &ctx.accounts.ai_authority.key().to_string(),
        tx,
        args.recipient_or_contract,
        &guardrail_vector_ciphertext_account,
        &spend_delta_vector_ciphertext_account,
        &comparison_vector_ciphertext_account,
        &flag_indices_vector_ciphertext_account,
        &policy_output_ciphertext_account,
    )
    .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
}

fn scoped_dependency_paused(
    config: &crate::program_accounts::PolicyConfigRecord,
    scope: PauseScope,
    now: i64,
) -> bool {
    let scope_kind = match scope {
        PauseScope::ConfidentialExecution => 5,
        PauseScope::DWalletFinalization => 6,
        _ => return false,
    };
    config
        .scoped_pause_entries
        .iter()
        .any(|entry| entry.scope_kind == scope_kind && entry.expires_at.is_none_or(|ts| now < ts))
}

fn validate_u64_vector_ciphertext(
    account: &UncheckedAccount<'_>,
    expected_encrypt_program: &Pubkey,
) -> Result<()> {
    if *account.owner != *expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let data = account.try_borrow_data()?;
    let parsed = parse_ciphertext_account(&data).map_err(crate::map_treasury_error)?;
    if parsed.fhe_type != ENCRYPT_FHE_VECTOR_U64 {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if parsed.status != 1 {
        return err!(crate::AuraCoreError::PolicyOutputNotReady);
    }

    Ok(())
}
