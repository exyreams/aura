use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{DWALLET_STATE_SEED, TREASURY_SEED},
    ext_cpi::DWALLET_CPI_AUTHORITY_SEED,
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, dwallet_status_from_code, DWalletAccount, TreasuryAccount,
        DWALLET_STATE_SPACE,
    },
    state::{DWalletState, DWalletStatus},
    AuraCoreError,
};

/// Whether a per-dWallet lifecycle transition is permitted.
///
/// `Active` is the only outbound-capable state. Freezing (`FrozenOut`/`Frozen`)
/// and `Retiring` are reversible back to `Active`; `Retired` is terminal and is
/// only reached from `Retiring` (via `remove_dwallet` / explicit retire).
fn status_transition_allowed(from: DWalletStatus, to: DWalletStatus) -> bool {
    use DWalletStatus::*;
    if from == to {
        return true;
    }
    matches!(
        (from, to),
        (Provisioning, Active)
            | (Active, FrozenOut)
            | (Active, Frozen)
            | (Active, Retiring)
            | (FrozenOut, Active)
            | (FrozenOut, Frozen)
            | (Frozen, Active)
            | (Frozen, FrozenOut)
            | (Retiring, Active)
            | (Retiring, Retired)
    )
}

/// Initializes the per-dWallet runtime account for `chain`.
///
/// Seeded by `[DWALLET_STATE_SEED, treasury, &[chain]]`. The dWallet must
/// already be registered on the treasury. Starts `Active` with no limits and
/// the program CPI authority as controller.
#[derive(Accounts)]
#[instruction(chain: u8)]
pub struct InitDwalletState<'info> {
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
        space = DWALLET_STATE_SPACE,
        seeds = [DWALLET_STATE_SEED, treasury.key().as_ref(), &[chain]],
        bump
    )]
    pub dwallet_state: Box<Account<'info, DWalletAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_dwallet_state(ctx: Context<InitDwalletState>, chain: u8, now: i64) -> Result<()> {
    let chain_ty = chain_from_code(chain)?;
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        domain.dwallets.contains_key(&chain_ty),
        AuraCoreError::DWalletNotConfigured
    );

    let (cpi_authority, _) =
        Pubkey::find_program_address(&[DWALLET_CPI_AUTHORITY_SEED], &crate::ID);
    let state = DWalletState {
        treasury: ctx.accounts.treasury.key().to_string(),
        chain: chain_ty,
        status: DWalletStatus::Active,
        daily_limit_usd: None,
        per_tx_limit_usd: None,
        spent_today_usd: 0,
        spend_window_start: now,
        authority: cpi_authority.to_string(),
        cpi_authority_seed: String::from_utf8_lossy(DWALLET_CPI_AUTHORITY_SEED).into_owned(),
        label: None,
        assets: Vec::new(),
        reserved_usd: 0,
        epoch: 0,
    };

    let account = &mut ctx.accounts.dwallet_state;
    account.bump = ctx.bumps.dwallet_state;
    account.apply_domain(&state)?;
    Ok(())
}

/// Shared accounts for owner-gated controls that mutate a per-dWallet account
/// and append an audit entry to the parent treasury.
#[derive(Accounts)]
#[instruction(chain: u8)]
pub struct DwalletControl<'info> {
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
        seeds = [DWALLET_STATE_SEED, treasury.key().as_ref(), &[chain]],
        bump = dwallet_state.bump,
        constraint = dwallet_state.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub dwallet_state: Box<Account<'info, DWalletAccount>>,
}

fn record_control_audit(
    treasury: &mut Account<TreasuryAccount>,
    detail: String,
    now: i64,
) -> Result<()> {
    let mut domain = treasury.to_domain_boxed()?;
    domain
        .audit_trail
        .record(AuditKind::ConfigChangeExecuted, detail, now);
    sync_treasury_account(treasury, &domain, now)
}

/// Transitions a dWallet's lifecycle status (freeze / unfreeze / retire).
pub fn set_dwallet_status(
    ctx: Context<DwalletControl>,
    _chain: u8,
    status_code: u8,
    now: i64,
) -> Result<()> {
    let next = dwallet_status_from_code(status_code)?;
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    require!(
        status_transition_allowed(state.status, next),
        AuraCoreError::InvalidStateTransition
    );
    state.status = next;
    ctx.accounts.dwallet_state.apply_domain(&state)?;
    record_control_audit(
        &mut ctx.accounts.treasury,
        format!("dwallet {} status -> {:?}", state.chain, next),
        now,
    )
}

/// Sets (or clears) the per-dWallet daily and per-transaction USD limits.
pub fn set_dwallet_limits(
    ctx: Context<DwalletControl>,
    _chain: u8,
    daily_limit_usd: Option<u64>,
    per_tx_limit_usd: Option<u64>,
    now: i64,
) -> Result<()> {
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    state.daily_limit_usd = daily_limit_usd;
    state.per_tx_limit_usd = per_tx_limit_usd;
    ctx.accounts.dwallet_state.apply_domain(&state)?;
    record_control_audit(
        &mut ctx.accounts.treasury,
        format!("dwallet {} limits updated", state.chain),
        now,
    )
}

/// Sets (or clears) a human-readable label on the dWallet (max 32 bytes).
pub fn set_dwallet_label(
    ctx: Context<DwalletControl>,
    _chain: u8,
    label: Option<String>,
    now: i64,
) -> Result<()> {
    require!(
        label.as_ref().is_none_or(|value| value.len() <= 32),
        AuraCoreError::InvalidExternalAccountData
    );
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    state.label = label;
    ctx.accounts.dwallet_state.apply_domain(&state)?;
    record_control_audit(
        &mut ctx.accounts.treasury,
        format!("dwallet {} label updated", state.chain),
        now,
    )
}

/// Rotates the on-chain authority / CPI authority seed that controls the
/// dWallet and bumps the rotation epoch.
pub fn rotate_dwallet_authority(
    ctx: Context<DwalletControl>,
    _chain: u8,
    new_authority: Pubkey,
    new_cpi_authority_seed: String,
    now: i64,
) -> Result<()> {
    require!(
        new_cpi_authority_seed.len() <= 48,
        AuraCoreError::InvalidExternalAccountData
    );
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    state.authority = new_authority.to_string();
    state.cpi_authority_seed = new_cpi_authority_seed;
    state.epoch = state.epoch.saturating_add(1);
    ctx.accounts.dwallet_state.apply_domain(&state)?;
    record_control_audit(
        &mut ctx.accounts.treasury,
        format!(
            "dwallet {} authority rotated (epoch {})",
            state.chain, state.epoch
        ),
        now,
    )
}

/// Sets or clears the treasury-wide preferred ("primary") execution chain.
#[derive(Accounts)]
pub struct SetDefaultChain<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn set_default_chain(ctx: Context<SetDefaultChain>, chain: Option<u8>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let chain_ty = chain.map(chain_from_code).transpose()?;
    domain
        .set_default_chain(chain_ty, now)
        .map_err(crate::map_treasury_error)?;
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Removes a registered dWallet and closes its runtime account.
///
/// Guards: the dWallet must be empty (no balance, nothing reserved) or already
/// `Retired`, must not be the treasury `default_chain`, and must have no active
/// pending proposal targeting its chain.
#[derive(Accounts)]
#[instruction(chain: u8)]
pub struct RemoveDwallet<'info> {
    #[account(mut)]
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
        close = owner,
        seeds = [DWALLET_STATE_SEED, treasury.key().as_ref(), &[chain]],
        bump = dwallet_state.bump,
        constraint = dwallet_state.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub dwallet_state: Box<Account<'info, DWalletAccount>>,
}

pub fn remove_dwallet(ctx: Context<RemoveDwallet>, chain: u8, now: i64) -> Result<()> {
    let chain_ty = chain_from_code(chain)?;
    let state = ctx.accounts.dwallet_state.to_domain()?;
    require!(
        state.status == DWalletStatus::Retired || state.total_usd() == 0,
        AuraCoreError::DWalletNotEmpty
    );
    require!(state.reserved_usd == 0, AuraCoreError::DWalletNotEmpty);

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        domain.default_chain != Some(chain_ty),
        AuraCoreError::DefaultChainInUse
    );
    require!(
        !domain
            .pending_queue
            .iter()
            .any(|pending| pending.target_chain == chain_ty),
        AuraCoreError::DWalletHasActiveProposal
    );
    domain.dwallets.remove(&chain_ty);
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("dwallet {chain_ty} removed"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
