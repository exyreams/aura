use anchor_lang::prelude::*;
use aura_policy::TransactionContext;

use crate::{
    constants::TREASURY_SEED,
    ext_cpi::{
        parse_ciphertext_account, AuraEncryptContext, ENCRYPT_CPI_AUTHORITY_SEED,
        ENCRYPT_EVENT_AUTHORITY_SEED, ENCRYPT_FHE_UINT64,
    },
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, transaction_type_from_code, TreasuryAccount},
};

/// Instruction data shared by `propose_confidential_transaction` and
/// `propose_confidential_vector_transaction`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeConfidentialTransactionArgs {
    /// Transaction amount in USD cents.
    pub amount_usd: u64,
    /// Numeric chain code (see `chain_from_code`).
    pub target_chain: u8,
    /// Numeric transaction type code (see `transaction_type_from_code`).
    pub tx_type: u8,
    /// Optional protocol identifier for DeFi protocol whitelisting.
    pub protocol_id: Option<u8>,
    /// Unix timestamp of proposal submission.
    pub current_timestamp: i64,
    /// Expected output amount in USD for slippage checks.
    pub expected_output_usd: Option<u64>,
    /// Actual output amount in USD for slippage checks.
    pub actual_output_usd: Option<u64>,
    /// Age of the price quote in seconds for freshness checks.
    pub quote_age_secs: Option<u64>,
    /// Counterparty risk score (0–100) for risk-adjusted limit scaling.
    pub counterparty_risk_score: Option<u8>,
    /// Destination address or contract on the target chain.
    pub recipient_or_contract: String,
}

#[derive(Accounts)]
pub struct ProposeConfidentialTransaction<'info> {
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.ai_authority == ai_authority.key() @ crate::AuraCoreError::UnauthorizedAi
    )]
    pub treasury: Account<'info, TreasuryAccount>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted daily limit.
    pub daily_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted per-transaction limit.
    pub per_tx_limit_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account for the encrypted spent-today counter.
    #[account(mut)]
    pub spent_today_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext account for the proposed transaction amount.
    pub amount_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned output ciphertext account that will receive the confidential violation code.
    #[account(mut)]
    pub policy_output_ciphertext: UncheckedAccount<'info>,
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

/// Proposes a confidential (scalar FHE) transaction.
///
/// Validates all Encrypt accounts, executes the `confidential_spend_guardrails`
/// FHE graph via CPI to produce an encrypted violation code, then calls
/// `propose_confidential_transaction` in the execution layer. The public
/// pre-check runs first; if it denies, the FHE graph is skipped and the
/// decision is recorded immediately.
pub fn handler(
    ctx: Context<ProposeConfidentialTransaction>,
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

    validate_u64_ciphertext(
        &ctx.accounts.daily_limit_ciphertext,
        &expected_encrypt_program,
        true,
    )?;
    validate_u64_ciphertext(
        &ctx.accounts.per_tx_limit_ciphertext,
        &expected_encrypt_program,
        true,
    )?;
    validate_u64_ciphertext(
        &ctx.accounts.spent_today_ciphertext,
        &expected_encrypt_program,
        true,
    )?;
    validate_u64_ciphertext(
        &ctx.accounts.amount_ciphertext,
        &expected_encrypt_program,
        true,
    )?;

    if ctx.accounts.daily_limit_ciphertext.key().to_string()
        != guardrails
            .daily_limit_ciphertext
            .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?
        || ctx.accounts.per_tx_limit_ciphertext.key().to_string()
            != guardrails
                .per_tx_limit_ciphertext
                .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?
        || ctx.accounts.spent_today_ciphertext.key().to_string()
            != guardrails
                .spent_today_ciphertext
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

    aura_policy::execute_confidential_spend_guardrails_graph(
        &encrypt_ctx,
        ctx.accounts.daily_limit_ciphertext.to_account_info(),
        ctx.accounts.per_tx_limit_ciphertext.to_account_info(),
        ctx.accounts.spent_today_ciphertext.to_account_info(),
        ctx.accounts.amount_ciphertext.to_account_info(),
        ctx.accounts.policy_output_ciphertext.to_account_info(),
    )?;

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

    let amount_ciphertext_account = ctx.accounts.amount_ciphertext.key().to_string();
    let policy_output_ciphertext_account = ctx.accounts.policy_output_ciphertext.key().to_string();
    crate::propose_confidential_transaction(
        &mut domain,
        &ctx.accounts.ai_authority.key().to_string(),
        tx,
        args.recipient_or_contract,
        &amount_ciphertext_account,
        &policy_output_ciphertext_account,
    )
    .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
}

fn validate_u64_ciphertext(
    account: &UncheckedAccount<'_>,
    expected_encrypt_program: &Pubkey,
    require_verified: bool,
) -> Result<()> {
    if *account.owner != *expected_encrypt_program {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    let data = account.try_borrow_data()?;
    let parsed = parse_ciphertext_account(&data).map_err(crate::map_treasury_error)?;
    if parsed.fhe_type != ENCRYPT_FHE_UINT64 {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }
    if require_verified && parsed.status != 1 {
        return err!(crate::AuraCoreError::PolicyOutputNotReady);
    }

    Ok(())
}
