//! On-chain standing orders (payroll / DCA / sweeps).
//!
//! A `ScheduledIntent` decides *when* a recurring spend is due and tracks its
//! recurrence budget; `execute_scheduled_intent` runs each due slot through the
//! **same** proposal policy + failure-mode path as an interactive proposal. An
//! approved due slot is promoted into normal pending execution; policy counters
//! are committed only by the standard finalize path.

use anchor_lang::prelude::*;
use aura_policy::{
    evaluate_conditions, evaluate_transaction, ConditionCombinator, ConditionContext,
    TransactionContext,
};

use crate::{
    audit::AuditKind,
    constants::{
        MAX_CONDITIONS_PER_PROPOSAL, MAX_SCHEDULE_RECIPIENTS, MIN_INTENT_INTERVAL_SECS,
        SCHEDULED_INTENT_SEED, TREASURY_SEED,
    },
    instructions::{conditional::condition_feed_value, sync_treasury_account},
    program_accounts::{
        chain_from_code, transaction_type_from_code, ConditionRecord, ScheduleRecipient,
        ScheduledIntent, TreasuryAccount, SCHEDULED_INTENT_SPACE,
    },
    AuraCoreError,
};

/// Instruction data shared by create / update (the editable surface).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScheduledIntentArgs {
    pub kind: u8,
    pub chain: u8,
    pub tx_type: u8,
    pub interval_secs: i64,
    pub start_at: i64,
    pub end_at: Option<i64>,
    pub max_runs: Option<u32>,
    pub per_run_limit_usd: u64,
    pub total_budget_usd: Option<u64>,
    pub recipients: Vec<ScheduleRecipient>,
    pub amount_usd: u64,
    pub skip_on_deny: bool,
    pub catch_up: bool,
    pub keeper: Option<Pubkey>,
    pub conditions: Vec<ConditionRecord>,
    pub combinator: u8,
}

impl ScheduledIntentArgs {
    fn run_amount(&self) -> u64 {
        if self.kind == 3 {
            self.recipients
                .iter()
                .fold(0u64, |acc, r| acc.saturating_add(r.amount_usd))
        } else {
            self.amount_usd
        }
    }

    /// Coherence validation for the recurrence + budget + payload.
    fn validate(&self) -> Result<()> {
        require!(self.kind <= 3, AuraCoreError::InvalidIntentConfig);
        require!(
            self.interval_secs >= MIN_INTENT_INTERVAL_SECS,
            AuraCoreError::InvalidIntentConfig
        );
        require!(
            self.per_run_limit_usd > 0,
            AuraCoreError::InvalidIntentConfig
        );
        require!(
            self.recipients.len() <= MAX_SCHEDULE_RECIPIENTS,
            AuraCoreError::InvalidIntentConfig
        );
        require!(
            self.conditions.len() <= MAX_CONDITIONS_PER_PROPOSAL,
            AuraCoreError::TooManyConditions
        );
        for condition in &self.conditions {
            condition.validate_oracle_descriptor()?;
        }
        // Chain / tx-type codes must be valid.
        chain_from_code(self.chain)?;
        transaction_type_from_code(self.tx_type)?;
        if let Some(end_at) = self.end_at {
            require!(end_at > self.start_at, AuraCoreError::InvalidIntentConfig);
        }
        if let Some(budget) = self.total_budget_usd {
            require!(
                budget >= self.per_run_limit_usd,
                AuraCoreError::InvalidIntentConfig
            );
        }
        require!(
            self.run_amount() <= self.per_run_limit_usd,
            AuraCoreError::InvalidIntentConfig
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(intent_id: u64, args: ScheduledIntentArgs)]
pub struct CreateScheduledIntent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = SCHEDULED_INTENT_SPACE,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &intent_id.to_le_bytes()],
        bump
    )]
    pub scheduled_intent: Box<Account<'info, ScheduledIntent>>,
    pub system_program: Program<'info, System>,
}

pub fn create_scheduled_intent(
    ctx: Context<CreateScheduledIntent>,
    intent_id: u64,
    args: ScheduledIntentArgs,
) -> Result<()> {
    args.validate()?;
    let intent = &mut ctx.accounts.scheduled_intent;
    intent.bump = ctx.bumps.scheduled_intent;
    intent.treasury = ctx.accounts.treasury.key();
    intent.intent_id = intent_id;
    intent.enabled = true;
    intent.kind = args.kind;
    intent.chain = args.chain;
    intent.tx_type = args.tx_type;
    intent.interval_secs = args.interval_secs;
    intent.start_at = args.start_at;
    intent.end_at = args.end_at;
    intent.max_runs = args.max_runs;
    intent.runs_completed = 0;
    intent.next_run_at = args.start_at;
    intent.last_run_at = 0;
    intent.missed_runs = 0;
    intent.per_run_limit_usd = args.per_run_limit_usd;
    intent.total_budget_usd = args.total_budget_usd;
    intent.spent_usd = 0;
    intent.in_flight_proposal_id = None;
    intent.in_flight_usd = 0;
    intent.recipients = args.recipients;
    intent.amount_usd = args.amount_usd;
    intent.skip_on_deny = args.skip_on_deny;
    intent.catch_up = args.catch_up;
    intent.keeper = args.keeper;
    intent.conditions = args.conditions;
    intent.combinator = args.combinator;
    Ok(())
}

#[derive(Accounts)]
pub struct ManageScheduledIntent<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &scheduled_intent.intent_id.to_le_bytes()],
        bump = scheduled_intent.bump,
        constraint = scheduled_intent.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub scheduled_intent: Box<Account<'info, ScheduledIntent>>,
}

pub fn update_scheduled_intent(
    ctx: Context<ManageScheduledIntent>,
    args: ScheduledIntentArgs,
) -> Result<()> {
    args.validate()?;
    let intent = &mut ctx.accounts.scheduled_intent;
    intent.kind = args.kind;
    intent.chain = args.chain;
    intent.tx_type = args.tx_type;
    intent.interval_secs = args.interval_secs;
    intent.end_at = args.end_at;
    intent.max_runs = args.max_runs;
    intent.per_run_limit_usd = args.per_run_limit_usd;
    intent.total_budget_usd = args.total_budget_usd;
    intent.recipients = args.recipients;
    intent.amount_usd = args.amount_usd;
    intent.skip_on_deny = args.skip_on_deny;
    intent.catch_up = args.catch_up;
    intent.keeper = args.keeper;
    intent.conditions = args.conditions;
    intent.combinator = args.combinator;
    Ok(())
}

pub fn set_scheduled_intent_enabled(
    ctx: Context<ManageScheduledIntent>,
    enabled: bool,
) -> Result<()> {
    ctx.accounts.scheduled_intent.enabled = enabled;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseScheduledIntent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        close = owner,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &scheduled_intent.intent_id.to_le_bytes()],
        bump = scheduled_intent.bump,
        constraint = scheduled_intent.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub scheduled_intent: Box<Account<'info, ScheduledIntent>>,
}

pub fn close_scheduled_intent(ctx: Context<CloseScheduledIntent>) -> Result<()> {
    require!(
        ctx.accounts
            .scheduled_intent
            .in_flight_proposal_id
            .is_none(),
        AuraCoreError::PendingTransactionExists
    );
    Ok(())
}

#[derive(Accounts)]
pub struct ClearScheduledIntentInFlight<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &scheduled_intent.intent_id.to_le_bytes()],
        bump = scheduled_intent.bump,
        constraint = scheduled_intent.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub scheduled_intent: Box<Account<'info, ScheduledIntent>>,
}

pub fn clear_scheduled_intent_in_flight(
    ctx: Context<ClearScheduledIntentInFlight>,
    proposal_id: u64,
    now: i64,
) -> Result<()> {
    require!(
        ctx.accounts.scheduled_intent.in_flight_proposal_id == Some(proposal_id),
        AuraCoreError::InvalidProposalStatus
    );

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.sync_pending_front();
    let still_pending = domain
        .pending_queue
        .iter()
        .any(|pending| pending.proposal_id == proposal_id);
    require!(!still_pending, AuraCoreError::PendingTransactionExists);

    let intent_id = ctx.accounts.scheduled_intent.intent_id;
    let released_usd = ctx.accounts.scheduled_intent.in_flight_usd;
    ctx.accounts
        .scheduled_intent
        .clear_in_flight_run(proposal_id)?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!(
            "scheduled intent {intent_id} released abandoned in-flight proposal {proposal_id} ({released_usd} usd)"
        ),
        now,
    );

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

#[derive(Accounts)]
pub struct ExecuteScheduledIntent<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [SCHEDULED_INTENT_SEED, treasury.key().as_ref(), &scheduled_intent.intent_id.to_le_bytes()],
        bump = scheduled_intent.bump,
        constraint = scheduled_intent.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub scheduled_intent: Box<Account<'info, ScheduledIntent>>,
    /// CHECK: optional price/oracle feed backing this intent's conditions; first
    /// 8 bytes are read little-endian and bound to each condition's `feed`.
    pub condition_feed: Option<UncheckedAccount<'info>>,
}

/// Builds the condition context and checks the intent's trigger conditions.
fn conditions_met(ctx: &Context<ExecuteScheduledIntent>, now: i64) -> Result<bool> {
    let intent = &ctx.accounts.scheduled_intent;
    if intent.conditions.is_empty() {
        return Ok(true);
    }

    let feed_value = condition_feed_value(
        &intent.conditions,
        ctx.accounts.condition_feed.as_ref(),
        now,
        ctx.accounts
            .treasury
            .policy_config
            .liveness_config
            .require_balance_oracle_freshness,
    )?;

    let condition_ctx = ConditionContext {
        now,
        available_usd: None,
        feed_price: feed_value,
        oracle_flag: feed_value.is_some_and(|value| value != 0),
    };
    let conditions = intent
        .conditions
        .iter()
        .map(ConditionRecord::to_domain)
        .collect::<Result<Vec<_>>>()?;
    Ok(evaluate_conditions(
        &condition_ctx,
        &conditions,
        ConditionCombinator::from_code(intent.combinator),
    ))
}

pub fn execute_scheduled_intent(ctx: Context<ExecuteScheduledIntent>) -> Result<()> {
    // This instruction is permissionless (when no keeper is set), so the time
    // source must be the trusted on-chain clock — never a caller argument —
    // otherwise a forged timestamp could roll the policy spend windows and
    // off-cadence the schedule.
    let now = Clock::get()?.unix_timestamp;
    let intent = &ctx.accounts.scheduled_intent;

    // Eligibility gates.
    require!(intent.enabled, AuraCoreError::IntentDisabled);
    require!(now >= intent.next_run_at, AuraCoreError::IntentNotDue);
    require!(
        intent.in_flight_proposal_id.is_none(),
        AuraCoreError::PendingTransactionExists
    );
    if let Some(end_at) = intent.end_at {
        require!(now <= end_at, AuraCoreError::IntentExpired);
    }
    if let Some(max_runs) = intent.max_runs {
        require!(
            intent.runs_completed < max_runs,
            AuraCoreError::IntentRunsExhausted
        );
    }
    if let Some(keeper) = intent.keeper {
        require!(
            ctx.accounts.caller.key() == keeper,
            AuraCoreError::UnauthorizedKeeper
        );
    }

    let run_amount = intent.run_amount_usd();
    require!(
        run_amount <= intent.per_run_limit_usd,
        AuraCoreError::IntentBudgetExhausted
    );
    if let Some(budget) = intent.total_budget_usd {
        require!(
            intent
                .spent_usd
                .saturating_add(intent.in_flight_usd)
                .saturating_add(run_amount)
                <= budget,
            AuraCoreError::IntentBudgetExhausted
        );
    }

    // Conditions gate entry; an unmet condition skips the run without advancing
    // the schedule (the tx reverts, leaving `next_run_at` untouched).
    require!(conditions_met(&ctx, now)?, AuraCoreError::ConditionUnmet);

    let recipient = intent.recipients.first().map(|r| r.address.clone());
    let tx = TransactionContext {
        amount_usd: run_amount,
        target_chain: chain_from_code(intent.chain)?,
        tx_type: transaction_type_from_code(intent.tx_type)?,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: recipient,
    };

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let decision = evaluate_transaction(
        &domain.policy_config,
        &domain.policy_state,
        &domain.policy_context(tx.clone()),
    );

    let intent = &mut ctx.accounts.scheduled_intent;
    if decision.approved {
        let ai_authority = domain.ai_authority.clone();
        let promoted_proposal_id = crate::propose_transaction(
            &mut domain,
            &ai_authority,
            tx,
            intent
                .recipients
                .first()
                .map(|r| r.address.clone())
                .unwrap_or_default(),
        )
        .map_err(crate::map_treasury_error)?;
        intent.mark_run_in_flight(promoted_proposal_id, run_amount);
        domain.audit_trail.record(
            AuditKind::ProposalCreated,
            format!(
                "scheduled intent {} promoted run to proposal {} ({run_amount} usd)",
                intent.intent_id, promoted_proposal_id
            ),
            now,
        );
    } else {
        domain.audit_trail.record(
            AuditKind::ProposalDenied,
            format!(
                "scheduled intent {} run denied: {:?}",
                intent.intent_id, decision.violation
            ),
            now,
        );
        // A denied run does not consume budget; only advance if explicitly told to.
        if intent.skip_on_deny {
            intent.next_run_at = intent.next_run_at.saturating_add(intent.interval_secs);
            intent.missed_runs = intent.missed_runs.saturating_add(1);
        }
    }

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
