use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, governance::EmergencyMultisig, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount, AuraCoreError,
};

/// Instruction data for `configure_multisig`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureMultisigArgs {
    /// Number of guardian signatures required to reach quorum (must be > 0
    /// and ≤ `guardians.len()`).
    pub required_signatures: u8,
    /// Public keys of all registered guardians.
    pub guardians: Vec<Pubkey>,
    /// Optional per-guardian voting weights, parallel to `guardians`. Empty
    /// means every guardian has weight 1 (plain M-of-N).
    pub guardian_weights: Vec<u16>,
    /// Summed weight required to satisfy a `Multisig`-level spend approval.
    /// Zero falls back to the `required_signatures` count quorum.
    pub required_approval_weight: u16,
    /// Unix timestamp used for the audit event.
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct ConfigureMultisig<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

/// Attaches or replaces the emergency multisig configuration on the treasury.
///
/// Validates that `required_signatures > 0` and does not exceed the number
/// of guardians. Only the treasury owner may call this instruction.
/// Emits a `MultisigAttached` audit event.
pub fn handler(ctx: Context<ConfigureMultisig>, args: ConfigureMultisigArgs) -> Result<()> {
    require!(
        !args.guardians.is_empty()
            && args.required_signatures > 0
            && usize::from(args.required_signatures) <= args.guardians.len(),
        AuraCoreError::InvalidGuardianConfiguration
    );
    // Weights, when supplied, must align 1:1 with guardians and the required
    // weight must be reachable by the registered guardians' total weight.
    require!(
        args.guardian_weights.is_empty() || args.guardian_weights.len() == args.guardians.len(),
        AuraCoreError::InvalidGuardianConfiguration
    );
    if args.required_approval_weight > 0 {
        let total_weight: u32 = if args.guardian_weights.is_empty() {
            args.guardians.len() as u32
        } else {
            args.guardian_weights.iter().map(|w| u32::from(*w)).sum()
        };
        require!(
            u32::from(args.required_approval_weight) <= total_weight,
            AuraCoreError::InvalidGuardianConfiguration
        );
    }

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let multisig = EmergencyMultisig {
        required_signatures: usize::from(args.required_signatures),
        guardians: args.guardians.iter().map(ToString::to_string).collect(),
        pending_override: None,
        pending_guardian_change: None,
        guardian_weights: args.guardian_weights.clone(),
        required_approval_weight: args.required_approval_weight,
    };
    domain.attach_multisig(multisig, args.timestamp);

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.timestamp)
}
