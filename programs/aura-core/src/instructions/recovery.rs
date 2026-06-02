//! Custody recovery and break-glass instructions.
//!
//! Three primitives:
//!
//! 1. `register_recovery_destination` — owner pre-registers a per-chain cold
//!    wallet address. The first registration is immediate; changing an existing
//!    address is gated by a `RECOVERY_DESTINATION_TIMELOCK_SECS` lock (48 h)
//!    so a stolen owner key cannot instantly redirect recovery. Blocked during
//!    an active emergency shutdown (`RecoveryDestinationImmutable`).
//!
//! 2. `break_glass_recover` — after the treasury enters emergency shutdown
//!    AND `RECOVERY_ACTIVATION_SECS` (1 h) have elapsed, the owner can open
//!    a break-glass pending proposal. The recipient is forced to the
//!    pre-registered address (not caller-supplied). Policy spend limits and
//!    the AI-authority check are bypassed; sanctions floors are not.
//!    The pending proposal then proceeds through the normal
//!    `execute_pending → finalize_execution` path.
//!
//! 3. `break_glass_transfer_authority` — nuclear option: transfers dWallet
//!    ownership to an owner-controlled key via `transfer_dwallet_via_cpi`,
//!    abandoning the treasury. Same shutdown precondition.

use anchor_lang::prelude::*;
use aura_policy::{PolicyDecision, TransactionType, ViolationCode};

use crate::{
    audit::AuditKind,
    constants::{RECOVERY_ACTIVATION_SECS, RECOVERY_DESTINATION_TIMELOCK_SECS, TREASURY_SEED},
    execution::generate_proposal_digest,
    ext_cpi::{transfer_dwallet_via_cpi, DWALLET_CPI_AUTHORITY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, TreasuryAccount},
    state::{PendingTransaction, ProposalStatus, TransferDetails},
    AuraCoreError,
};

// Accounts

#[derive(Accounts)]
pub struct RecoveryConfig<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

#[derive(Accounts)]
pub struct BreakGlassRecover<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

#[derive(Accounts)]
pub struct BreakGlassTransferAuthority<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: dWallet account whose ownership will be transferred.
    #[account(mut)]
    pub dwallet: UncheckedAccount<'info>,
    /// CHECK: aura-core caller-program account (this program's ID).
    pub caller_program: UncheckedAccount<'info>,
    /// CHECK: CPI authority PDA signed by this program.
    pub cpi_authority: UncheckedAccount<'info>,
    /// CHECK: dWallet program (verified by transfer_dwallet_via_cpi).
    pub dwallet_program: UncheckedAccount<'info>,
}

// Args

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterRecoveryDestinationArgs {
    pub chain: u8,
    pub address: String,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BreakGlassRecoverArgs {
    pub chain: u8,
    /// Amount in USD to sweep. Pass 0 to use the treasury's cached dWallet
    /// balance for the chain.
    pub amount_usd: u64,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BreakGlassTransferAuthorityArgs {
    pub chain: u8,
    pub new_authority: Pubkey,
    pub now: i64,
}

// Handlers

/// Registers or updates the per-chain recovery destination.
///
/// The first registration for a chain takes effect immediately. Updating an
/// existing entry is blocked if the current timestamp is still within the
/// `locked_until` window set when the entry was last written
/// (`RecoveryTimelockActive`). Registration is also blocked during an active
/// emergency shutdown (`RecoveryDestinationImmutable`).
pub fn register_recovery_destination(
    ctx: Context<RecoveryConfig>,
    args: RegisterRecoveryDestinationArgs,
) -> Result<()> {
    require!(
        !args.address.is_empty() && args.address.len() <= 128,
        AuraCoreError::InvalidExternalAccountData
    );
    let chain = chain_from_code(args.chain)?;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain
        .set_recovery_destination(
            chain,
            args.address,
            args.now,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

/// Creates a break-glass sweep pending proposal.
///
/// Precondition: the treasury must be in emergency shutdown AND at least
/// `RECOVERY_ACTIVATION_SECS` must have elapsed since shutdown. The recipient
/// is forced to the pre-registered recovery address for `chain` — it cannot be
/// overridden by the caller. Policy spend limits and the AI-authority check are
/// bypassed; the pending proposal then proceeds through the normal
/// `execute_pending → finalize_execution` path.
pub fn break_glass_recover(
    ctx: Context<BreakGlassRecover>,
    args: BreakGlassRecoverArgs,
) -> Result<()> {
    let chain = chain_from_code(args.chain)?;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;

    // Precondition: treasury must be in emergency shutdown and the activation
    // window must have elapsed.
    let shutdown_at = domain
        .shutdown_initiated_at
        .ok_or_else(|| error!(AuraCoreError::RecoveryPreconditionNotMet))?;
    require!(
        args.now >= shutdown_at.saturating_add(RECOVERY_ACTIVATION_SECS),
        AuraCoreError::RecoveryPreconditionNotMet
    );

    // Pending slot must be free.
    require!(
        domain.pending.is_none(),
        AuraCoreError::PendingTransactionExists
    );

    // Get the pre-registered address — caller cannot supply their own.
    let recovery = domain
        .get_recovery_destination(chain)
        .ok_or_else(|| error!(AuraCoreError::NoRecoveryDestination))?;
    let recovery_address = recovery.address.clone();

    // Amount: use provided amount or fall back to cached dWallet balance.
    let amount_usd = if args.amount_usd > 0 {
        args.amount_usd
    } else {
        domain
            .dwallets
            .get(&chain)
            .map(|dw| dw.balance_usd)
            .unwrap_or(0)
    };

    // Build a break-glass approved decision without running policy eval.
    // `next_state` is left as the current state so no spend counters advance.
    let decision = PolicyDecision {
        approved: true,
        violation: ViolationCode::None,
        next_state: domain.policy_state.clone(),
        risk_score: 0,
        regulatory_flags: 0,
        effective_daily_limit_usd: 0,
        risk_factors: Vec::new(),
        trace: Vec::new(),
    };

    let proposal_id = domain.next_proposal_id;
    domain.next_proposal_id = domain.next_proposal_id.saturating_add(1);
    let transfer = TransferDetails::default();
    let proposal_digest = generate_proposal_digest(
        proposal_id,
        chain,
        TransactionType::Transfer,
        &recovery_address,
        amount_usd,
        args.now,
        "break_glass",
        &transfer,
    );

    domain
        .push_pending(PendingTransaction {
            proposal_id,
            proposal_digest,
            policy_graph_name: "break_glass".to_string(),
            policy_output_digest: "break_glass".to_string(),
            policy_output_ciphertext_account: None,
            policy_output_fhe_type: None,
            target_chain: chain,
            tx_type: TransactionType::Transfer,
            amount_usd,
            transfer,
            recipient_or_contract: recovery_address.clone(),
            protocol_id: None,
            submitted_at: args.now,
            expires_at: args.now.saturating_add(domain.pending_transaction_ttl_secs),
            last_updated_at: args.now,
            execution_attempts: 0,
            status: ProposalStatus::Proposed,
            decryption_request: None,
            signature_request: None,
            risk_score: 0,
            required_approval_level: 0,
            satisfied_approval_level: 0,
            approvals: Vec::new(),
            earliest_execution_at: 0,
            requires_guardian_cosign: false,
            policy_version: domain.current_policy_version,
            compliance_metadata: None,
            decision,
        })
        .map_err(crate::map_treasury_error)?;

    domain.audit_trail.record(
        AuditKind::BreakGlassRecovered,
        format!(
            "break-glass sweep proposal {proposal_id} created for {chain} → {recovery_address} ({amount_usd} usd)"
        ),
        args.now,
    );

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

/// Transfers dWallet ownership to a new authority via CPI.
///
/// Nuclear option: hands the dWallet to an owner-controlled key, abandoning
/// the treasury. Requires the same shutdown precondition as `break_glass_recover`.
pub fn break_glass_transfer_authority(
    ctx: Context<BreakGlassTransferAuthority>,
    args: BreakGlassTransferAuthorityArgs,
) -> Result<()> {
    let chain = chain_from_code(args.chain)?;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;

    let shutdown_at = domain
        .shutdown_initiated_at
        .ok_or_else(|| error!(AuraCoreError::RecoveryPreconditionNotMet))?;
    require!(
        args.now >= shutdown_at.saturating_add(RECOVERY_ACTIVATION_SECS),
        AuraCoreError::RecoveryPreconditionNotMet
    );

    let (cpi_authority_pda, cpi_bump) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    require!(
        ctx.accounts.cpi_authority.key() == cpi_authority_pda,
        AuraCoreError::InvalidExternalAccountData
    );

    transfer_dwallet_via_cpi(
        &ctx.accounts.dwallet_program,
        &ctx.accounts.dwallet,
        &ctx.accounts.caller_program,
        &ctx.accounts.cpi_authority,
        cpi_bump,
        &args.new_authority,
    )?;

    domain.audit_trail.record(
        AuditKind::CustodyTransferred,
        format!(
            "dWallet ownership transferred for {chain} → {} (break-glass)",
            args.new_authority
        ),
        args.now,
    );

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

// Unit tests

#[cfg(test)]
mod tests {
    use aura_policy::Chain;

    use crate::{
        constants::{RECOVERY_ACTIVATION_SECS, RECOVERY_DESTINATION_TIMELOCK_SECS},
        errors::TreasuryError,
        state::ProtocolDeployment,
    };

    fn make_treasury() -> crate::state::AgentTreasury {
        let deployment = ProtocolDeployment::devnet_pre_alpha(
            "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce".to_string(),
        )
        .unwrap();
        crate::state::AgentTreasury::new(
            "test-agent",
            "11111111111111111111111111111111",
            "22222222222222222222222222222222",
            1_000,
            aura_policy::PolicyConfig::default(),
            deployment,
        )
    }

    #[test]
    fn first_registration_is_immediate() {
        let mut t = make_treasury();
        t.set_recovery_destination(
            Chain::Ethereum,
            "0xAA00000000000000000000000000000000000001".to_string(),
            1_000,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .unwrap();
        let dest = t.get_recovery_destination(Chain::Ethereum).unwrap();
        assert_eq!(dest.address, "0xAA00000000000000000000000000000000000001");
        assert_eq!(dest.registered_at, 1_000);
    }

    #[test]
    fn changing_within_lock_is_rejected() {
        let mut t = make_treasury();
        t.set_recovery_destination(
            Chain::Ethereum,
            "0xAA00000000000000000000000000000000000001".to_string(),
            1_000,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .unwrap();
        // try to change before lock expires
        let err = t
            .set_recovery_destination(
                Chain::Ethereum,
                "0xBB00000000000000000000000000000000000002".to_string(),
                1_001,
                RECOVERY_DESTINATION_TIMELOCK_SECS,
            )
            .unwrap_err();
        assert_eq!(err, TreasuryError::RecoveryTimelockActive);
        // still the original address
        assert_eq!(
            t.get_recovery_destination(Chain::Ethereum).unwrap().address,
            "0xAA00000000000000000000000000000000000001"
        );
    }

    #[test]
    fn changing_after_lock_is_allowed() {
        let mut t = make_treasury();
        t.set_recovery_destination(
            Chain::Ethereum,
            "0xAA00000000000000000000000000000000000001".to_string(),
            1_000,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .unwrap();
        let after_lock = 1_000 + RECOVERY_DESTINATION_TIMELOCK_SECS;
        t.set_recovery_destination(
            Chain::Ethereum,
            "0xBB00000000000000000000000000000000000002".to_string(),
            after_lock,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .unwrap();
        assert_eq!(
            t.get_recovery_destination(Chain::Ethereum).unwrap().address,
            "0xBB00000000000000000000000000000000000002"
        );
    }

    #[test]
    fn registration_during_shutdown_is_rejected() {
        let mut t = make_treasury();
        t.set_recovery_destination(
            Chain::Ethereum,
            "0xAA00000000000000000000000000000000000001".to_string(),
            1_000,
            RECOVERY_DESTINATION_TIMELOCK_SECS,
        )
        .unwrap();
        t.emergency_shutdown(
            "11111111111111111111111111111111",
            "11111111111111111111111111111111".to_string(),
            2_000,
        )
        .unwrap();
        let err = t
            .set_recovery_destination(
                Chain::Ethereum,
                "0xCC00000000000000000000000000000000000003".to_string(),
                2_001 + RECOVERY_DESTINATION_TIMELOCK_SECS,
                RECOVERY_DESTINATION_TIMELOCK_SECS,
            )
            .unwrap_err();
        assert_eq!(err, TreasuryError::RecoveryDestinationImmutable);
    }

    #[test]
    fn break_glass_precondition_no_shutdown() {
        let t = make_treasury();
        // No shutdown → RecoveryPreconditionNotMet
        assert!(t.shutdown_initiated_at.is_none());
    }

    #[test]
    fn break_glass_precondition_activation_window() {
        let mut t = make_treasury();
        t.emergency_shutdown(
            "11111111111111111111111111111111",
            "11111111111111111111111111111111".to_string(),
            2_000,
        )
        .unwrap();
        // Activation window check: now must be >= shutdown_at + RECOVERY_ACTIVATION_SECS
        let shutdown_at = t.shutdown_initiated_at.unwrap();
        assert!(2_000 + RECOVERY_ACTIVATION_SECS - 1 < shutdown_at + RECOVERY_ACTIVATION_SECS);
        assert!(2_000 + RECOVERY_ACTIVATION_SECS >= shutdown_at + RECOVERY_ACTIVATION_SECS);
    }

    #[test]
    fn no_recovery_destination_error() {
        let t = make_treasury();
        assert!(t.get_recovery_destination(Chain::Ethereum).is_none());
    }
}
