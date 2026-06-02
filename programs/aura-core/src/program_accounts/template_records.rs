use super::*;

/// Fixed allocation for a [`PolicyTemplate`] account.
pub const POLICY_TEMPLATE_SPACE: usize = 8 + PolicyTemplate::INIT_SPACE;

/// A user-authored, reusable policy configuration.
///
/// Seeded by `[POLICY_TEMPLATE_SEED, owner, template_id]`. Holds a full
/// [`PolicyConfigRecord`] plus provenance/metadata so it can be authored once
/// and applied (optionally parameterized) across treasuries. `shared` templates
/// may be applied by other owners with attribution retained in the audit trail.
#[account]
#[derive(InitSpace)]
pub struct PolicyTemplate {
    pub bump: u8,
    /// Template author / owner.
    pub owner: Pubkey,
    /// Stable identifier within `owner`'s namespace.
    pub template_id: u64,
    #[max_len(48)]
    pub name: String,
    #[max_len(160)]
    pub description: String,
    /// Bumped on every `update_policy_template`.
    pub version: u32,
    pub created_at: i64,
    pub updated_at: i64,
    /// Number of times this template has been applied to any treasury.
    pub applied_count: u64,
    /// Whether non-owners may apply this template (attribution retained).
    pub shared: bool,
    /// `PolicyPresetKind` code when forked from a built-in preset.
    pub source_preset: Option<u8>,
    /// The serialized policy posture this template applies.
    pub config: PolicyConfigRecord,
}

/// Fixed allocation for a [`BillingTemplate`] account.
pub const BILLING_TEMPLATE_SPACE: usize = 8 + BillingTemplate::INIT_SPACE;

/// A user-authored, reusable billing (fee) posture.
///
/// Seeded by `[BILLING_TEMPLATE_SEED, owner, template_id]`, mirroring
/// [`PolicyTemplate`]: holds a full [`FeeScheduleRecord`] plus provenance so a
/// billing shape can be authored once (or forked from a `BillingProfileKind`)
/// and applied across treasuries within the `ProtocolConfig` bounds.
#[account]
#[derive(InitSpace)]
pub struct BillingTemplate {
    pub bump: u8,
    pub owner: Pubkey,
    pub template_id: u64,
    #[max_len(48)]
    pub name: String,
    #[max_len(160)]
    pub description: String,
    pub version: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub applied_count: u64,
    pub shared: bool,
    /// `BillingProfileKind` code when forked from a built-in profile.
    pub source_kind: Option<u8>,
    /// The serialized fee posture this template applies.
    pub schedule: FeeScheduleRecord,
}
