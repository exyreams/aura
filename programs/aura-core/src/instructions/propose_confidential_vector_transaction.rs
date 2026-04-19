use anchor_lang::prelude::*;
use aura_policy::TransactionContext;

use crate::{
    constants::TREASURY_SEED,
    ext_cpi::{
        parse_ciphertext_account, AuraEncryptContext, ENCRYPT_CPI_AUTHORITY_SEED,
        ENCRYPT_EVENT_AUTHORITY_SEED, ENCRYPT_FHE_VECTOR_U64,
    },
    instructions::{
        propose_confidential_transaction::ProposeConfidentialTransactionArgs, sync_treasury_account,
    },
    program_accounts::{chain_from_code, transaction_type_from_code, TreasuryAccount},
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
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Encrypt-owned ciphertext account containing [daily_limit, per_tx_limit, spent_today].
    pub guardrail_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account containing the proposed amount in lane 0.
    pub amount_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned output ciphertext account that will receive [violation_code, next_spent_today].
    #[account(mut)]
    pub policy_result_vector_ciphertext: UncheckedAccount<'info>,
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

/// Proposes a confidential vector FHE transaction.
///
/// Like `propose_confidential_transaction` but uses the vector FHE graph
/// which takes a single `EUint64Vector` guardrail ciphertext encoding
/// `[daily_limit, per_tx_limit, spent_today]` and produces a result vector
/// encoding `[violation_code, next_spent_today]`. The output ciphertext
/// becomes the new guardrail vector for the next proposal.
pub fn handler(
    ctx: Context<ProposeConfidentialVectorTransaction>,
    args: ProposeConfidentialTransactionArgs,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let guardrails = domain
        .confidential_guardrails
        .clone()
        .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?;
    let expected_encrypt_program: Pubkey = domain
        .deployment
        .encrypt_program_id
        .parse()
        .map_err(|_| error!(crate::AuraCoreError::InvalidDeployment))?;
    if ctx.accounts.encrypt_program.key() != expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if ctx.accounts.caller_program.key() != crate::ID || !ctx.accounts.caller_program.executable {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let (expected_cpi_authority, cpi_authority_bump) =
        Pubkey::find_program_address(&[ENCRYPT_CPI_AUTHORITY_SEED], &crate::ID);
    if ctx.accounts.cpi_authority.key() != expected_cpi_authority {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let (expected_event_authority, _) =
        Pubkey::find_program_address(&[ENCRYPT_EVENT_AUTHORITY_SEED], &expected_encrypt_program);
    if ctx.accounts.event_authority.key() != expected_event_authority {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    validate_u64_vector_ciphertext(
        &ctx.accounts.guardrail_vector_ciphertext,
        &expected_encrypt_program,
    )?;
    validate_u64_vector_ciphertext(
        &ctx.accounts.amount_vector_ciphertext,
        &expected_encrypt_program,
    )?;

    if ctx.accounts.guardrail_vector_ciphertext.key().to_string()
        != guardrails
            .guardrail_vector_ciphertext
            .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?
    {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let encrypt_ctx = AuraEncryptContext {
        encrypt_program: ctx.accounts.encrypt_program.to_account_info(),
        config: ctx.accounts.config.to_account_info(),
        deposit: ctx.accounts.deposit.to_account_info(),
        cpi_authority: ctx.accounts.cpi_authority.to_account_info(),
        caller_program: ctx.accounts.caller_program.to_account_info(),
        network_encryption_key: ctx.accounts.network_encryption_key.to_account_info(),
        payer: ctx.accounts.ai_authority.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        cpi_authority_bump,
    };

    aura_policy::execute_confidential_spend_guardrails_vector_graph(
        &encrypt_ctx,
        ctx.accounts.guardrail_vector_ciphertext.to_account_info(),
        ctx.accounts.amount_vector_ciphertext.to_account_info(),
        ctx.accounts
            .policy_result_vector_ciphertext
            .to_account_info(),
    )?;

    let policy_output_fhe_type = {
        let data = ctx
            .accounts
            .policy_result_vector_ciphertext
            .try_borrow_data()?;
        parse_ciphertext_account(&data)
            .map_err(crate::map_treasury_error)?
            .fhe_type
    };

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
    };

    let guardrail_vector_ciphertext_account =
        ctx.accounts.guardrail_vector_ciphertext.key().to_string();
    let amount_vector_ciphertext_account = ctx.accounts.amount_vector_ciphertext.key().to_string();
    let policy_output_ciphertext_account = ctx
        .accounts
        .policy_result_vector_ciphertext
        .key()
        .to_string();
    crate::propose_confidential_vector_transaction(
        &mut domain,
        &ctx.accounts.ai_authority.key().to_string(),
        tx,
        args.recipient_or_contract,
        &guardrail_vector_ciphertext_account,
        &amount_vector_ciphertext_account,
        &policy_output_ciphertext_account,
    )
    .map_err(crate::map_treasury_error)?;

    if let Some(pending) = domain.pending.as_mut() {
        pending.policy_output_fhe_type = Some(policy_output_fhe_type);
    }

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
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
