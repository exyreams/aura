//! Persist explainable policy decision receipts.
//!
//! Receipts turn pending proposal decisions into compact audit records that
//! clients can index without replaying the full policy engine trace.

use anchor_lang::prelude::*;
use aura_policy::{explain_decision, required_approval_level, ApprovalLevel};

use crate::{
    constants::{POLICY_RECEIPT_SEED, TREASURY_SEED},
    program_accounts::{
        violation_code, PolicyAttestationAccount, PolicyReceiptAccount, TreasuryAccount,
        POLICY_RECEIPT_SPACE,
    },
    program_events::emit_policy_receipt_event,
};

/// Instruction data for `write_policy_receipt`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WritePolicyReceiptArgs {
    /// Pending proposal identifier to snapshot into a receipt PDA.
    pub proposal_id: u64,
    /// Unix timestamp recorded as receipt creation time.
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: WritePolicyReceiptArgs)]
pub struct WritePolicyReceipt<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = POLICY_RECEIPT_SPACE,
        seeds = [POLICY_RECEIPT_SEED, treasury.key().as_ref(), &args.proposal_id.to_le_bytes()],
        bump
    )]
    pub receipt: Box<Account<'info, PolicyReceiptAccount>>,
    pub attestation: Option<Box<Account<'info, PolicyAttestationAccount>>>,
    pub system_program: Program<'info, System>,
}

pub fn write_policy_receipt(
    ctx: Context<WritePolicyReceipt>,
    args: WritePolicyReceiptArgs,
) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    let pending = domain
        .pending_queue
        .iter()
        .find(|pending| pending.proposal_id == args.proposal_id)
        .or_else(|| {
            domain
                .pending
                .as_ref()
                .filter(|pending| pending.proposal_id == args.proposal_id)
        })
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let approval_level = domain
        .policy_config
        .approval_ladder
        .as_ref()
        .map(|ladder| {
            required_approval_level(
                ladder,
                pending.amount_usd,
                u16::from(pending.decision.risk_score) * 100,
            )
        })
        .unwrap_or(ApprovalLevel::None);
    let fields = explain_decision(
        &pending.decision,
        domain.policy_state.spent_today_usd,
        approval_level,
    );
    let policy_attested = ctx
        .accounts
        .attestation
        .as_ref()
        .is_some_and(|attestation| {
            attestation.treasury == ctx.accounts.treasury.key()
                && attestation.policy_version == ctx.accounts.treasury.current_policy_version
        });

    let receipt = &mut ctx.accounts.receipt;
    receipt.bump = ctx.bumps.receipt;
    receipt.treasury = ctx.accounts.treasury.key();
    receipt.proposal_id = pending.proposal_id;
    receipt.policy_version = pending.policy_version;
    receipt.decision = fields.decision;
    receipt.primary_violation = violation_code(pending.decision.violation);
    receipt.risk_score = pending.decision.risk_score;
    receipt.rule_outcome_bitmap = fields.rule_outcome_bitmap;
    receipt.required_approval_level = pending
        .required_approval_level
        .max(fields.required_approval_level);
    receipt.satisfied_approval_level = pending.satisfied_approval_level;
    receipt.effective_limit_usd = fields.effective_limit_usd;
    receipt.remaining_daily_usd = fields.remaining_daily_usd;
    receipt.evaluated_amount_usd = pending.amount_usd;
    receipt.aggregate_amount_usd = pending.amount_usd;
    receipt.batch_item_count = 1;
    receipt.created_at = args.now;
    receipt.confidential_input_commitment = None;
    receipt.confidential_output_commitment = None;
    receipt.decrypt_request_hash = pending
        .decryption_request
        .as_ref()
        .and_then(|request| request.plaintext_sha256.as_ref())
        .and_then(|hex| decode_hex_32(hex));
    receipt.policy_attested = policy_attested;
    emit_policy_receipt_event(ctx.accounts.treasury.key(), receipt);
    Ok(())
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    let bytes = hex::decode(value).ok()?;
    let array: [u8; 32] = bytes.try_into().ok()?;
    Some(array)
}
