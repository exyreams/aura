use anchor_lang::prelude::*;
use aura_policy::{PauseScope, ScopedPauseEntry};

use crate::{
    audit::AuditKind,
    constants::{MAX_SCOPED_PAUSE_ENTRIES, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, role_permissions, OperatorRoleAccount, TreasuryAccount},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetScopedPauseArgs {
    pub scope_kind: u8,
    pub chain: Option<u8>,
    pub tx_type: Option<u8>,
    pub recipient: Option<String>,
    pub protocol_id: Option<u8>,
    pub paused: bool,
    pub expires_at: Option<i64>,
    pub now: i64,
}

#[derive(Accounts)]
pub struct SetScopedPause<'info> {
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
}

pub fn set_scoped_pause(ctx: Context<SetScopedPause>, args: SetScopedPauseArgs) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::MANAGE_SCOPED_PAUSE,
                args.now,
            )?;
    }
    let scope = pause_scope_from_args(&args)?;
    domain
        .policy_config
        .scoped_pause
        .entries
        .retain(|entry| entry.scope != scope);
    if args.paused {
        require!(
            domain.policy_config.scoped_pause.entries.len() < MAX_SCOPED_PAUSE_ENTRIES,
            crate::AuraCoreError::InvalidExternalAccountData
        );
        domain
            .policy_config
            .scoped_pause
            .entries
            .push(ScopedPauseEntry {
                scope,
                paused_by: ctx.accounts.operator.key().to_string(),
                paused_at: args.now,
                expires_at: args.expires_at,
            });
    }
    domain.audit_trail.record(
        if args.paused {
            AuditKind::ExecutionPaused
        } else {
            AuditKind::ExecutionResumed
        },
        "scoped pause updated",
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

fn pause_scope_from_args(args: &SetScopedPauseArgs) -> Result<PauseScope> {
    Ok(match args.scope_kind {
        0 => PauseScope::All,
        1 => PauseScope::Chain {
            chain: chain_from_code(
                args.chain
                    .ok_or_else(|| error!(crate::AuraCoreError::InvalidChain))?,
            )?,
        },
        2 => PauseScope::Category {
            tx_type_code: args
                .tx_type
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidTransactionType))?,
        },
        3 => PauseScope::Recipient {
            recipient: args
                .recipient
                .clone()
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?,
        },
        4 => PauseScope::Protocol {
            protocol_id: args
                .protocol_id
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?,
        },
        5 => PauseScope::ConfidentialExecution,
        6 => PauseScope::DWalletFinalization,
        _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
    })
}
