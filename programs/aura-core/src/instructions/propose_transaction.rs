use anchor_lang::prelude::*;
use aura_policy::TransactionContext;

use crate::{
    constants::TREASURY_SEED,
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, transaction_type_from_code, TreasuryAccount},
};

/// Instruction data for `propose_transaction`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeTransactionArgs {
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
pub struct ProposeTransaction<'info> {
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.ai_authority == ai_authority.key() @ crate::AuraCoreError::UnauthorizedAi
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Proposes a public (non-confidential) transaction.
///
/// Runs the full policy engine synchronously and records the decision on the
/// pending transaction. No FHE evaluation or decryption step is needed;
/// `execute_pending` can be called immediately after this instruction.
pub fn handler(ctx: Context<ProposeTransaction>, args: ProposeTransactionArgs) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
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

    crate::propose_transaction(
        &mut domain,
        &ctx.accounts.ai_authority.key().to_string(),
        tx,
        args.recipient_or_contract,
    )
    .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
}
