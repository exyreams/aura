use anchor_lang::prelude::*;
use aura_policy::{
    evaluate_policy_without_spend_mutation, explain_decision, required_approval_level,
    ApprovalLevel, PolicyEvaluationContext, TransactionContext,
};

use crate::{
    constants::{POLICY_SIMULATION_SEED, TREASURY_SEED},
    program_accounts::{
        chain_from_code, role_permissions, transaction_type_from_code, violation_code,
        OperatorRoleAccount, PolicySimulationResultAccount, TreasuryAccount,
        POLICY_SIMULATION_SPACE,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SimulatePolicyArgs {
    pub simulation_id: u64,
    pub amount_usd: u64,
    pub target_chain: u8,
    pub tx_type: u8,
    pub protocol_id: Option<u8>,
    pub current_timestamp: i64,
    pub expected_output_usd: Option<u64>,
    pub actual_output_usd: Option<u64>,
    pub quote_age_secs: Option<u64>,
    pub counterparty_risk_score: Option<u8>,
    pub recipient_or_contract: String,
}

#[derive(Accounts)]
#[instruction(args: SimulatePolicyArgs)]
pub struct SimulatePolicy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    #[account(
        init,
        payer = payer,
        space = POLICY_SIMULATION_SPACE,
        seeds = [POLICY_SIMULATION_SEED, treasury.key().as_ref(), &args.simulation_id.to_le_bytes()],
        bump
    )]
    pub simulation_result: Box<Account<'info, PolicySimulationResultAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn simulate_policy(ctx: Context<SimulatePolicy>, args: SimulatePolicyArgs) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    if ctx.accounts.payer.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.payer.key(),
                role_permissions::RUN_SIMULATION,
                args.current_timestamp,
            )?;
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
        recipient_or_contract: Some(args.recipient_or_contract),
    };
    let context = PolicyEvaluationContext {
        transaction: tx.clone(),
        reputation_score: Some(domain.reputation.score()),
        shared_spent_usd: domain
            .swarm
            .as_ref()
            .map(|swarm| swarm.total_swarm_spent_usd),
    };
    let decision = evaluate_policy_without_spend_mutation(
        &domain.policy_config,
        &domain.policy_state,
        &context,
    );
    let approval_level = domain
        .policy_config
        .approval_ladder
        .as_ref()
        .map(|ladder| {
            required_approval_level(
                ladder,
                args.amount_usd,
                u16::from(decision.risk_score) * 100,
            )
        })
        .unwrap_or(ApprovalLevel::None);
    let receipt = explain_decision(
        &decision,
        domain.policy_state.spent_today_usd,
        approval_level,
    );

    let result = &mut ctx.accounts.simulation_result;
    result.bump = ctx.bumps.simulation_result;
    result.treasury = ctx.accounts.treasury.key();
    result.simulation_id = args.simulation_id;
    result.checked_at = args.current_timestamp;
    result.approved = decision.approved;
    result.violation_code = violation_code(decision.violation);
    result.risk_score = decision.risk_score;
    result.effective_daily_limit_usd = decision.effective_daily_limit_usd;
    result.remaining_daily_budget_usd = receipt.remaining_daily_usd;
    result.rule_outcome_bitmap = receipt.rule_outcome_bitmap;
    result.required_approval_level = approval_level.code();
    result.amount_usd = args.amount_usd;
    result.target_chain = args.target_chain;
    result.tx_type = args.tx_type;
    Ok(())
}
