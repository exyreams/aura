use anchor_lang::prelude::*;
use aura_policy::{
    evaluate_policy_without_spend_mutation, rule_outcome_bitmap, PolicyEvaluationContext,
    TransactionContext,
};

use crate::{
    constants::TREASURY_SEED,
    instructions::{
        sync_treasury_account, sync_treasury_pending_account,
        wallet_transfers::{
            profile_confirmations_required, reserve_transfer_details,
            validate_chain_execution_binding_with_profile,
            validate_recipient_for_chain_with_profile, validate_transfer_details,
        },
    },
    program_accounts::{
        chain_from_code, sha256_address, transaction_type_from_code, verify_merkle_inclusion,
        AddressListAccount, BudgetEnvelopeAccount, ChainProfileAccount, ComplianceOracleAccount,
        DWalletAccount, ExposureGroupAccount, PolicyCanaryAccount, SessionKeyAccount,
        SwarmPoolAccount, TreasuryAccount,
    },
    state::{ChainExecutionBinding, TransferDetails},
    AuraCoreError,
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
    /// Optional chain-native transfer payload. When set, proposal creation
    /// reserves the matching dWallet runtime account and finalization must
    /// settle that account.
    pub asset_id: Option<String>,
    pub native_amount: Option<u128>,
    pub decimals: Option<u8>,
    pub gas_native_amount: Option<u128>,
    pub gas_asset_id: Option<String>,
    /// Optional EVM chain ID, UTXO nonce, or Solana blockhash-related binding data.
    pub evm_chain_id: Option<u64>,
    pub replay_nonce: Option<u64>,
    pub gas_limit: Option<u64>,
    pub max_fee_native: Option<u128>,
    pub calldata_hash: Option<[u8; 32]>,
    pub utxo_set_hash: Option<[u8; 32]>,
    pub sighash_type: Option<u32>,
    pub solana_recent_blockhash: Option<[u8; 32]>,
    pub solana_message_hash: Option<[u8; 32]>,
    pub confirmations_required: Option<u16>,
}

impl ProposeTransactionArgs {
    pub fn transfer_details(&self) -> TransferDetails {
        TransferDetails {
            asset_id: self.asset_id.clone(),
            native_amount: self.native_amount,
            decimals: self.decimals,
            gas_native_amount: self.gas_native_amount,
            gas_asset_id: self.gas_asset_id.clone(),
            execution_binding: ChainExecutionBinding {
                evm_chain_id: self.evm_chain_id,
                replay_nonce: self.replay_nonce,
                gas_limit: self.gas_limit,
                max_fee_native: self.max_fee_native,
                calldata_hash: self.calldata_hash,
                utxo_set_hash: self.utxo_set_hash,
                sighash_type: self.sighash_type,
                solana_recent_blockhash: self.solana_recent_blockhash,
                solana_message_hash: self.solana_message_hash,
                confirmations_required: self.confirmations_required,
            },
        }
    }
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
    pub budget_envelope: Option<Box<Account<'info, BudgetEnvelopeAccount>>>,
    pub exposure_group: Option<Box<Account<'info, ExposureGroupAccount>>>,
    #[account(mut)]
    pub dwallet_state: Option<Box<Account<'info, DWalletAccount>>>,
    pub chain_profile: Option<Box<Account<'info, ChainProfileAccount>>>,
    /// Optional trust + identity PDA.  When provided: enforces trust-tier
    /// lockdown and validates secondary-agent scopes.  When absent: falls back
    /// to `ai_authority`-only check with no tier enforcement.
    #[account(mut)]
    pub trust_identity: Option<Box<Account<'info, crate::program_accounts::TrustIdentityAccount>>>,
    /// Optional shadow candidate. When enabled, the proposal is scored a second
    /// time against the candidate and the divergence is tallied — the candidate
    /// is never enforced.
    #[account(mut)]
    pub policy_canary: Option<Box<Account<'info, PolicyCanaryAccount>>>,
}

/// Proposes a public (non-confidential) transaction.
///
/// Runs the full policy engine synchronously and records the decision on the
/// pending transaction. No FHE evaluation or decryption step is needed;
/// `execute_pending` can be called immediately after this instruction.
pub fn handler(ctx: Context<ProposeTransaction>, args: ProposeTransactionArgs) -> Result<()> {
    // Trust + identity checks (optional TrustIdentityAccount)
    let ai_key = ctx.accounts.ai_authority.key().to_string();
    if let Some(ti) = ctx.accounts.trust_identity.as_mut() {
        ti.apply_trust_decay(args.current_timestamp);
        require!(!ti.is_lockdown(), AuraCoreError::TrustLockdownActive);
        if !ti.agents.is_empty() {
            let ai_authority_str = ctx.accounts.treasury.ai_authority.to_string();
            require!(
                ti.is_authorized_agent(&ai_key, &ai_authority_str, args.target_chain, args.tx_type),
                AuraCoreError::AgentScopeExceeded
            );
            // Capability manifest gate: enforce the matching agent's
            // full manifest and record its action stats. A breach escalates the
            // trust tier via a behavior signal before the proposal is rejected.
            ti.enforce_and_record_agent_action(
                &ai_key,
                args.target_chain,
                args.tx_type,
                args.protocol_id,
                args.amount_usd,
                args.current_timestamp,
            )
            .map_err(crate::map_treasury_error)?;
        }
    }

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    // Inject tier multiplier so the policy engine applies the trust-tier haircut.
    // A Restricted (or worse) tier also forces at least Multisig approval.
    if let Some(ref ti) = ctx.accounts.trust_identity {
        domain.tier_multiplier_bps = Some(ti.tier_multiplier_bps());
        domain.force_multisig_approval =
            ti.trust_tier() as u8 >= crate::state::trust::TrustTier::Restricted as u8;
    }
    let mut transfer = args.transfer_details();
    validate_transfer_details(&transfer)?;
    let target_chain = chain_from_code(args.target_chain)?;
    let chain_profile = ctx.accounts.chain_profile.as_deref().map(|value| &**value);
    if transfer.has_chain_binding() && transfer.execution_binding.confirmations_required.is_none() {
        transfer.execution_binding.confirmations_required =
            Some(profile_confirmations_required(target_chain, chain_profile)?);
    }
    if transfer.has_chain_binding() || transfer.requires_wallet_settlement() {
        validate_recipient_for_chain_with_profile(
            target_chain,
            chain_profile,
            &args.recipient_or_contract,
        )?;
    }
    validate_chain_execution_binding_with_profile(target_chain, &transfer, chain_profile)?;
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

    if let Some(envelope) = &ctx.accounts.budget_envelope {
        require!(
            envelope.treasury == ctx.accounts.treasury.key(),
            crate::AuraCoreError::InvalidExternalAccountData
        );
        envelope.assert_available(
            args.amount_usd,
            args.target_chain,
            args.tx_type,
            args.protocol_id,
            args.current_timestamp,
        )?;
    }

    if let Some(group) = &ctx.accounts.exposure_group {
        group.assert_member(ctx.accounts.treasury.key())?;
        group.assert_available(args.amount_usd, args.current_timestamp)?;
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
        target_chain,
        tx_type: transaction_type_from_code(args.tx_type)?,
        protocol_id: args.protocol_id,
        current_timestamp: args.current_timestamp,
        expected_output_usd: args.expected_output_usd,
        actual_output_usd: args.actual_output_usd,
        quote_age_secs: args.quote_age_secs,
        counterparty_risk_score: args.counterparty_risk_score,
        recipient_or_contract: Some(args.recipient_or_contract.clone()),
    };

    // Capture the pre-spend inputs the shadow evaluation needs before the
    // enforced evaluation consumes them.
    let canary_active = ctx.accounts.policy_canary.as_ref().is_some_and(|canary| {
        canary.treasury == ctx.accounts.treasury.key() && canary.should_sample()
    });
    let canary_inputs = canary_active.then(|| (tx.clone(), domain.policy_state.clone()));

    let proposal_id = crate::propose_transaction_with_transfer(
        &mut domain,
        &signer,
        tx,
        args.recipient_or_contract,
        transfer.clone(),
    )
    .map_err(crate::map_treasury_error)?;

    if let (Some((canary_tx, pre_state)), Some(canary)) =
        (canary_inputs, ctx.accounts.policy_canary.as_mut())
    {
        if let Some(enforced) = domain
            .active_pending()
            .filter(|pending| pending.proposal_id == proposal_id)
            .map(|pending| pending.decision.clone())
        {
            let context = PolicyEvaluationContext {
                transaction: canary_tx,
                reputation_score: Some(domain.reputation.score()),
                shared_spent_usd: domain
                    .swarm
                    .as_ref()
                    .map(|swarm| swarm.total_swarm_spent_usd),
                tier_multiplier_bps: domain.tier_multiplier_bps,
            };
            let candidate = evaluate_policy_without_spend_mutation(
                &canary.candidate.to_domain(),
                &pre_state,
                &context,
            );
            let divergence = rule_outcome_bitmap(&enforced) ^ rule_outcome_bitmap(&candidate);
            canary.record_sample(enforced.approved, candidate.approved, divergence);
        }
    }

    let reserved = domain
        .active_pending()
        .is_some_and(|pending| pending.proposal_id == proposal_id && pending.decision.approved);
    if reserved && transfer.requires_wallet_settlement() {
        let dwallet_state = ctx
            .accounts
            .dwallet_state
            .as_mut()
            .ok_or_else(|| error!(crate::AuraCoreError::DWalletNotConfigured))?;
        reserve_transfer_details(
            dwallet_state,
            ctx.accounts.treasury.key(),
            args.target_chain,
            args.amount_usd,
            &transfer,
            args.current_timestamp,
        )?;
    }

    if transfer.requires_wallet_settlement() {
        sync_treasury_pending_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
    } else {
        sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.current_timestamp)
    }
}
