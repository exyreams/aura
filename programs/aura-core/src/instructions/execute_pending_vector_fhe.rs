use anchor_lang::prelude::*;
use aura_policy::{confidential_policy_graph, PauseScope};

use crate::{
    constants::TREASURY_SEED,
    ext_cpi::{
        parse_ciphertext_account, AuraEncryptContext, ENCRYPT_CPI_AUTHORITY_SEED,
        ENCRYPT_EVENT_AUTHORITY_SEED, ENCRYPT_FHE_VECTOR_U64,
    },
    program_accounts::{
        proposal_status_code, ExternalLivenessAccount, PolicyConfigRecord, TreasuryAccount,
    },
    state::ProposalStatus,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExecutePendingVectorFheArgs {
    /// Pending proposal identifier whose vector FHE graph should be submitted.
    pub proposal_id: u64,
    /// Unix timestamp used for freshness checks and status accounting.
    pub current_timestamp: i64,
}

#[derive(Accounts)]
pub struct ExecutePendingVectorFhe<'info> {
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.ai_authority == ai_authority.key() @ crate::AuraCoreError::UnauthorizedAi
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: Encrypt-owned ciphertext account containing the current guardrail vector.
    pub guardrail_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with `[-amount mod u64, 0, amount]`.
    pub spend_delta_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with `[amount, amount]` for limit checks.
    pub comparison_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Encrypt-owned ciphertext vector with assign target lanes `[3, 4, 5, ...]`.
    pub flag_indices_vector_ciphertext: UncheckedAccount<'info>,
    /// CHECK: Pre-allocated Encrypt-owned output vector ciphertext account.
    ///
    /// The vector runtime expects an existing `EUint64Vector` output account and
    /// overwrites its digest during graph execution.
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
    pub external_liveness: Option<Box<Account<'info, ExternalLivenessAccount>>>,
    pub system_program: Program<'info, System>,
}

/// Executes the vector confidential policy graph for an already-created pending proposal.
///
/// `propose_confidential_vector_transaction` intentionally persists the
/// pending proposal without invoking Encrypt. This second instruction gives
/// the FHE CPI a fresh BPF heap frame, validates the ciphertext accounts
/// against the proposal digest, and marks the pending proposal so the graph
/// cannot be replayed.
pub fn handler(
    ctx: Context<ExecutePendingVectorFhe>,
    args: ExecutePendingVectorFheArgs,
) -> Result<()> {
    let cpi_authority_bump = prepare_vector_fhe_execution(&ctx, &args)?;

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
        ctx.accounts.spend_delta_vector_ciphertext.to_account_info(),
        ctx.accounts.comparison_vector_ciphertext.to_account_info(),
        ctx.accounts
            .flag_indices_vector_ciphertext
            .to_account_info(),
        ctx.accounts
            .policy_result_vector_ciphertext
            .to_account_info(),
    )?;

    let pending = ctx
        .accounts
        .treasury
        .pending_queue
        .get_mut(0)
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    pending.status = proposal_status_code(ProposalStatus::PolicyComputed);
    pending.last_updated_at = args.current_timestamp;
    ctx.accounts.treasury.updated_at = args.current_timestamp;
    Ok(())
}

fn prepare_vector_fhe_execution(
    ctx: &Context<ExecutePendingVectorFhe>,
    args: &ExecutePendingVectorFheArgs,
) -> Result<u8> {
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

    let expected_encrypt_program: Pubkey = crate::ENCRYPT_DEVNET_PROGRAM_ID
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

    let guardrails = ctx
        .accounts
        .treasury
        .confidential_guardrails
        .as_ref()
        .ok_or_else(|| error!(crate::AuraCoreError::ConfidentialGuardrailsNotConfigured))?;
    if Some(ctx.accounts.guardrail_vector_ciphertext.key())
        != guardrails.guardrail_vector_ciphertext
    {
        return err!(crate::AuraCoreError::InvalidExternalAccountData);
    }

    {
        let pending = ctx
            .accounts
            .treasury
            .pending_queue
            .first()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        if pending.proposal_id != args.proposal_id {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        }
        if pending.status != proposal_status_code(ProposalStatus::Proposed) {
            return err!(crate::AuraCoreError::PolicyOutputAlreadyComputed);
        }
        if pending.policy_graph_name != confidential_policy_graph().name {
            return err!(crate::AuraCoreError::PolicyGraphMismatch);
        }
        if pending.policy_output_fhe_type != Some(ENCRYPT_FHE_VECTOR_U64) {
            return err!(crate::AuraCoreError::PolicyGraphMismatch);
        }
        let policy_output = pending
            .policy_output_ciphertext_account
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::PolicyGraphMismatch))?;
        if policy_output
            != &ctx
                .accounts
                .policy_result_vector_ciphertext
                .key()
                .to_string()
        {
            return err!(crate::AuraCoreError::InvalidExternalAccountData);
        }

        let expected_digest = crate::hash_message(&format!(
            "{}:{}:{}:{}:{}:{}:{}",
            pending.policy_graph_name,
            ctx.accounts.guardrail_vector_ciphertext.key(),
            ctx.accounts.spend_delta_vector_ciphertext.key(),
            ctx.accounts.comparison_vector_ciphertext.key(),
            ctx.accounts.flag_indices_vector_ciphertext.key(),
            ctx.accounts.policy_result_vector_ciphertext.key(),
            pending.submitted_at
        ));
        if pending.policy_output_digest != expected_digest {
            return err!(crate::AuraCoreError::PolicyDigestMismatch);
        }
    }

    Ok(cpi_authority_bump)
}

fn scoped_dependency_paused(config: &PolicyConfigRecord, scope: PauseScope, now: i64) -> bool {
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
