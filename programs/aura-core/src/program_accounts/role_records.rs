//! Anchor account records for scoped operator roles.
//!
//! Role accounts grant a non-owner key a bitmask of maintenance permissions
//! with an expiry and revocation flag.

use super::*;

/// Allocated size for an `OperatorRoleAccount`.
pub const OPERATOR_ROLE_SPACE: usize = 8 + 256;

/// Permission bits understood by operator-gated instructions.
pub mod role_permissions {
    /// Permission to mutate address lists.
    pub const MANAGE_ADDRESS_LISTS: u64 = 1 << 0;
    /// Permission to take treasury snapshots.
    pub const TAKE_SNAPSHOTS: u64 = 1 << 1;
    /// Permission to refresh health scores.
    pub const REFRESH_HEALTH: u64 = 1 << 2;
    /// Permission to run policy simulations.
    pub const RUN_SIMULATION: u64 = 1 << 3;
    /// Permission to refresh external dependency liveness.
    pub const REFRESH_LIVENESS: u64 = 1 << 4;
    /// Permission to manage scoped pause entries.
    pub const MANAGE_SCOPED_PAUSE: u64 = 1 << 5;
}

/// Scoped permission grant for one operator on one treasury.
#[account]
#[derive(InitSpace)]
pub struct OperatorRoleAccount {
    /// PDA bump for the role account.
    pub bump: u8,
    /// Treasury this role applies to.
    pub treasury: Pubkey,
    /// Operator public key receiving permissions.
    pub operator: Pubkey,
    /// Bitmask of granted permissions.
    pub permission_mask: u64,
    /// Unix timestamp after which the role is inactive.
    pub expires_at: i64,
    /// Whether the owner revoked this role before expiry.
    pub revoked: bool,
    /// Owner that granted the role.
    pub granted_by: Pubkey,
    /// Unix timestamp when the role was granted.
    pub granted_at: i64,
}

impl OperatorRoleAccount {
    /// Returns true when the role is active and contains `permission`.
    pub fn has_permission(&self, permission: u64, now: i64) -> bool {
        !self.revoked && now < self.expires_at && (self.permission_mask & permission) == permission
    }

    /// Validates treasury/operator identity plus permission and expiry.
    pub fn assert_permission(
        &self,
        treasury: Pubkey,
        operator: Pubkey,
        permission: u64,
        now: i64,
    ) -> Result<()> {
        require!(
            self.treasury == treasury && self.operator == operator,
            AuraCoreError::OperatorRoleMissing
        );
        require!(
            self.has_permission(permission, now),
            AuraCoreError::OperatorRoleExpired
        );
        Ok(())
    }
}
