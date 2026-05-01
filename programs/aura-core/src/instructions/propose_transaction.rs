use anchor_lang::prelude::*;
use aura_policy::TransactionContext;

use crate::{
    constants::TREASURY_SEED,
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, sha256_address, transaction_type_from_code, verify_merkle_inclusion,
        AddressListAccount, ComplianceOracleAccount, SessionKeyAccount, SwarmPoolAccount,
        TreasuryAccount,
    },
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
    /// Merkle proof proving the recipient is present in the sanctions root.
    /// Empty when sanctions checking is disabled or the root is a direct leaf.
    pub sanctions_proof: Vec<[u8; 32]>,
}

#[derive(Accounts)]
pub struct ProposeTransaction<'info> {
    pub ai_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub session_key_account: Option<Box<Account<'info, SessionKeyAccount>>>,
    pub swarm_pool: Option<Box<Account<'info, SwarmPoolAccount>>>,
    pub address_list: Option<Box<Account<'info, AddressListAccount>>>,
    pub compliance_oracle: Option<Box<Account<'info, ComplianceOracleAccount>>>,
    pub parent_treasury: Option<Box<Account<'info, TreasuryAccount>>>,
}

/// Proposes a public (non-confidential) transaction.
///
/// Runs the full policy engine synchronously and records the decision on the
/// pending transaction. No FHE evaluation or decryption step is needed;
/// `execute_pending` can be called immediately after this instruction.
pub fn handler(ctx: Context<ProposeTransaction>, args: ProposeTransactionArgs) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let authority = ctx.accounts.ai_authority.key();
    let signer = if let Some(session) = ctx.accounts.session_key_account.as_mut() {
        require!(
            session.treasury == ctx.accounts.treasury.key(),
            crate::AuraCoreError::UnauthorizedAi
        );
        require!(
            session.session_key == authority,
            crate::AuraCoreError::UnauthorizedAi
        );
        if args
            .current_timestamp
            .saturating_sub(session.session_last_reset)
            >= 86_400
        {
            session.session_spent_today_usd = 0;
            session.session_last_reset = args.current_timestamp;
        }
        require!(
            session.allows(
                args.amount_usd,
                args.target_chain,
                args.tx_type,
                args.current_timestamp
            ),
            crate::AuraCoreError::SessionKeyScopeViolation
        );
        session.proposals_submitted = session.proposals_submitted.saturating_add(1);
        session.session_spent_today_usd = session
            .session_spent_today_usd
            .saturating_add(args.amount_usd);
        domain.ai_authority.clone()
    } else {
        require!(
            domain.ai_authority == authority.to_string(),
            crate::AuraCoreError::UnauthorizedAi
        );
        authority.to_string()
    };

    if let Some(pool) = &ctx.accounts.swarm_pool {
        require!(
            domain
                .swarm
                .as_ref()
                .is_some_and(|swarm| swarm.swarm_id == pool.swarm_id),
            crate::AuraCoreError::InvalidExternalAccountData
        );
        if let Some(swarm) = domain.swarm.as_mut() {
            swarm.total_swarm_spent_usd = pool.total_spent_usd;
        }
    }

    if let Some(parent) = &ctx.accounts.parent_treasury {
        let parent_domain = parent.to_domain_boxed()?;
        require!(
            parent_domain
                .child_agents
                .iter()
                .any(|child| child == &ctx.accounts.treasury.key().to_string()),
            crate::AuraCoreError::ParentLimitExceeded
        );
        let parent_remaining = parent_domain
            .policy_config
            .daily_limit_usd
            .saturating_sub(parent_domain.policy_state.spent_today_usd);
        require!(
            args.amount_usd <= parent_remaining,
            crate::AuraCoreError::ParentLimitExceeded
        );
    }

    if let Some(list) = &ctx.accounts.address_list {
        require!(
            list.treasury == ctx.accounts.treasury.key() && list.chain == args.target_chain,
            crate::AuraCoreError::InvalidExternalAccountData
        );
        let listed = list
            .addresses
            .iter()
            .any(|address| address == &args.recipient_or_contract);
        match list.mode {
            0 => require!(!listed, crate::AuraCoreError::RecipientBlacklisted),
            1 => require!(listed, crate::AuraCoreError::RecipientNotWhitelisted),
            _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
        }
    }

    if domain.sanctions_check_enabled {
        let oracle = ctx
            .accounts
            .compliance_oracle
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?;
        require!(
            domain.compliance_oracle.as_deref() == Some(&oracle.key().to_string()),
            crate::AuraCoreError::InvalidExternalAccountData
        );
        let is_sanctioned = verify_merkle_inclusion(
            &oracle.sanctions_root,
            &sha256_address(&args.recipient_or_contract),
            &args.sanctions_proof,
        );
        require!(!is_sanctioned, crate::AuraCoreError::SanctionedAddress);
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

    crate::propose_transaction(&mut domain, &signer, tx, args.recipient_or_contract)
        .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
}
