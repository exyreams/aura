use super::*;

pub const CHAIN_PROFILE_SPACE: usize = 8 + ChainProfileAccount::INIT_SPACE;

/// Address format expected for recipients on a target chain.
pub const ADDRESS_FORMAT_EVM: u8 = 0;
pub const ADDRESS_FORMAT_BITCOIN: u8 = 1;
pub const ADDRESS_FORMAT_SOLANA: u8 = 2;
pub const ADDRESS_FORMAT_CUSTOM: u8 = 255;

/// Replay-protection fields required for the chain's signed transaction.
pub const REPLAY_SCHEME_EVM: u8 = 0;
pub const REPLAY_SCHEME_UTXO: u8 = 1;
pub const REPLAY_SCHEME_SOLANA: u8 = 2;

/// Finality model advertised to settlement relayers.
pub const FINALITY_PROBABILISTIC: u8 = 0;
pub const FINALITY_INSTANT: u8 = 1;
pub const FINALITY_OPTIMISTIC: u8 = 2;

#[account]
#[derive(InitSpace)]
pub struct ChainProfileAccount {
    pub bump: u8,
    pub authority: Pubkey,
    pub chain_code: u8,
    pub enabled: bool,
    pub address_format: u8,
    pub replay_scheme: u8,
    pub finality_model: u8,
    pub curve: u8,
    pub signature_scheme: u8,
    pub native_gas_asset: [u8; 16],
    pub evm_chain_id: Option<u64>,
    pub confirmations_required: u16,
    pub registered_at: i64,
    pub updated_at: i64,
}

impl ChainProfileAccount {
    pub fn assert_valid_for(&self, chain_code: u8) -> Result<()> {
        require!(
            self.enabled,
            crate::AuraCoreError::ChainProfileNotRegistered
        );
        require!(
            self.chain_code == chain_code,
            crate::AuraCoreError::ChainProfileNotRegistered
        );
        validate_chain_profile_fields(
            self.address_format,
            self.replay_scheme,
            self.finality_model,
            self.curve,
            self.signature_scheme,
            self.evm_chain_id,
            self.confirmations_required,
        )
    }
}

#[allow(clippy::too_many_arguments)]
pub fn validate_chain_profile_fields(
    address_format: u8,
    replay_scheme: u8,
    finality_model: u8,
    curve: u8,
    signature_scheme: u8,
    evm_chain_id: Option<u64>,
    confirmations_required: u16,
) -> Result<()> {
    require!(
        matches!(
            address_format,
            ADDRESS_FORMAT_EVM
                | ADDRESS_FORMAT_BITCOIN
                | ADDRESS_FORMAT_SOLANA
                | ADDRESS_FORMAT_CUSTOM
        ),
        crate::AuraCoreError::InvalidExternalAccountData
    );
    require!(
        matches!(
            replay_scheme,
            REPLAY_SCHEME_EVM | REPLAY_SCHEME_UTXO | REPLAY_SCHEME_SOLANA
        ),
        crate::AuraCoreError::InvalidExternalAccountData
    );
    require!(
        matches!(
            finality_model,
            FINALITY_PROBABILISTIC | FINALITY_INSTANT | FINALITY_OPTIMISTIC
        ),
        crate::AuraCoreError::InvalidExternalAccountData
    );
    crate::program_accounts::curve_from_code(curve)?;
    crate::program_accounts::signature_scheme_from_code(signature_scheme)?;
    require!(
        confirmations_required > 0,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    if replay_scheme == REPLAY_SCHEME_EVM {
        require!(
            evm_chain_id.is_some_and(|value| value > 0),
            crate::AuraCoreError::InvalidExternalAccountData
        );
    }
    Ok(())
}

pub fn fixed_asset_symbol(symbol: &str) -> Result<[u8; 16]> {
    require!(
        symbol.len() <= 16 && !symbol.is_empty(),
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let mut bytes = [0u8; 16];
    bytes[..symbol.len()].copy_from_slice(symbol.as_bytes());
    Ok(bytes)
}
