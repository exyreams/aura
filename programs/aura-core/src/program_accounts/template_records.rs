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
