use super::*;

pub const OPERATOR_ROLE_SPACE: usize = 8 + 256;

pub mod role_permissions {
    pub const MANAGE_ADDRESS_LISTS: u64 = 1 << 0;
    pub const TAKE_SNAPSHOTS: u64 = 1 << 1;
    pub const REFRESH_HEALTH: u64 = 1 << 2;
    pub const RUN_SIMULATION: u64 = 1 << 3;
    pub const REFRESH_LIVENESS: u64 = 1 << 4;
    pub const MANAGE_SCOPED_PAUSE: u64 = 1 << 5;
}

#[account]
#[derive(InitSpace)]
pub struct OperatorRoleAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub operator: Pubkey,
    pub permission_mask: u64,
    pub expires_at: i64,
    pub revoked: bool,
    pub granted_by: Pubkey,
    pub granted_at: i64,
}

impl OperatorRoleAccount {
    pub fn has_permission(&self, permission: u64, now: i64) -> bool {
        !self.revoked && now < self.expires_at && (self.permission_mask & permission) == permission
    }

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
