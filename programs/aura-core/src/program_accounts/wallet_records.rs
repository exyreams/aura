use super::*;

/// see `chain_code`, `curve_code`, and `signature_scheme_code`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct DWalletRecord {
    pub chain: u8,
    #[max_len(64)]
    pub dwallet_id: String,
    #[max_len(128)]
    pub address: String,
    pub balance_usd: u64,
    pub balance_updated_at: i64,
    pub balance_oracle: Option<Pubkey>,
    pub dwallet_account: Option<Pubkey>,
    pub authorized_user_pubkey: Option<Pubkey>,
    #[max_len(64)]
    pub message_metadata_digest: Option<String>,
    #[max_len(130)]
    pub public_key_hex: Option<String>,
    pub curve: u8,
    pub signature_scheme: u8,
}

impl DWalletRecord {
    pub fn from_domain(domain: &DWalletReference) -> Result<Self> {
        Ok(Self {
            chain: chain_code(domain.chain),
            dwallet_id: domain.dwallet_id.clone(),
            address: domain.address.clone(),
            balance_usd: domain.balance_usd,
            balance_updated_at: domain.balance_updated_at,
            balance_oracle: domain
                .balance_oracle
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            dwallet_account: domain
                .dwallet_account
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            authorized_user_pubkey: domain
                .authorized_user_pubkey
                .as_deref()
                .map(parse_pubkey)
                .transpose()?,
            message_metadata_digest: domain.message_metadata_digest.clone(),
            public_key_hex: domain.public_key_hex.clone(),
            curve: curve_code(domain.curve),
            signature_scheme: signature_scheme_code(domain.signature_scheme),
        })
    }

    pub fn to_domain(&self) -> Result<DWalletReference> {
        Ok(DWalletReference {
            dwallet_id: self.dwallet_id.clone(),
            chain: chain_from_code(self.chain)?,
            address: self.address.clone(),
            balance_usd: self.balance_usd,
            balance_updated_at: self.balance_updated_at,
            balance_oracle: self.balance_oracle.map(|key| key.to_string()),
            authority: crate::ID.to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: self.dwallet_account.map(|key| key.to_string()),
            authorized_user_pubkey: self.authorized_user_pubkey.map(|key| key.to_string()),
            message_metadata_digest: self.message_metadata_digest.clone(),
            public_key_hex: self.public_key_hex.clone(),
            curve: curve_from_code(self.curve)?,
            signature_scheme: signature_scheme_from_code(self.signature_scheme)?,
        })
    }
}

/// Fixed allocation for a `DWalletAccount` (well under the 10 KiB CPI ceiling).
pub const DWALLET_STATE_SPACE: usize = 8 + DWalletAccount::INIT_SPACE;

/// One asset balance row inside a `DWalletAccount`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct AssetBalanceRecord {
    #[max_len(64)]
    pub asset_id: String,
    #[max_len(16)]
    pub symbol: String,
    pub decimals: u8,
    pub native_amount: u128,
    pub usd_value: u64,
    pub updated_at: i64,
    pub feed: Option<Pubkey>,
}

/// Per-dWallet runtime account, seeded by
/// `[b"dwallet_state", treasury, &[chain_code]]`. Holds the controls + the
/// multi-asset ledger that don't fit inline in the 10 KiB treasury account.
#[account]
#[derive(InitSpace)]
pub struct DWalletAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub chain: u8,
    pub status: u8,
    pub daily_limit_usd: Option<u64>,
    pub per_tx_limit_usd: Option<u64>,
    pub spent_today_usd: u64,
    pub spend_window_start: i64,
    pub authority: Pubkey,
    #[max_len(48)]
    pub cpi_authority_seed: String,
    #[max_len(32)]
    pub label: Option<String>,
    #[max_len(16)]
    pub assets: Vec<AssetBalanceRecord>,
    pub reserved_usd: u64,
    pub epoch: u64,
}

/// Maps a `DWalletStatus` to its `u8` storage code.
pub fn dwallet_status_code(status: crate::state::DWalletStatus) -> u8 {
    use crate::state::DWalletStatus::*;
    match status {
        Provisioning => 0,
        Active => 1,
        FrozenOut => 2,
        Frozen => 3,
        Retiring => 4,
        Retired => 5,
    }
}

/// Decodes a `u8` storage code into a `DWalletStatus`.
pub fn dwallet_status_from_code(code: u8) -> Result<crate::state::DWalletStatus> {
    use crate::state::DWalletStatus::*;
    Ok(match code {
        0 => Provisioning,
        1 => Active,
        2 => FrozenOut,
        3 => Frozen,
        4 => Retiring,
        5 => Retired,
        _ => return err!(crate::AuraCoreError::InvalidStateTransition),
    })
}

impl AssetBalanceRecord {
    pub fn from_domain(asset: &crate::state::AssetBalance) -> Result<Self> {
        Ok(Self {
            asset_id: asset.asset_id.clone(),
            symbol: asset.symbol.clone(),
            decimals: asset.decimals,
            native_amount: asset.native_amount,
            usd_value: asset.usd_value,
            updated_at: asset.updated_at,
            feed: asset.feed.as_deref().map(parse_pubkey).transpose()?,
        })
    }

    pub fn to_domain(&self) -> crate::state::AssetBalance {
        crate::state::AssetBalance {
            asset_id: self.asset_id.clone(),
            symbol: self.symbol.clone(),
            decimals: self.decimals,
            native_amount: self.native_amount,
            usd_value: self.usd_value,
            updated_at: self.updated_at,
            feed: self.feed.map(|key| key.to_string()),
        }
    }
}

impl DWalletAccount {
    /// Serialize a `DWalletState` domain object into this account (preserves `bump`).
    pub fn apply_domain(&mut self, state: &crate::state::DWalletState) -> Result<()> {
        self.treasury = parse_pubkey(&state.treasury)?;
        self.chain = chain_code(state.chain);
        self.status = dwallet_status_code(state.status);
        self.daily_limit_usd = state.daily_limit_usd;
        self.per_tx_limit_usd = state.per_tx_limit_usd;
        self.spent_today_usd = state.spent_today_usd;
        self.spend_window_start = state.spend_window_start;
        self.authority = parse_pubkey(&state.authority)?;
        self.cpi_authority_seed = state.cpi_authority_seed.clone();
        self.label = state.label.clone();
        self.assets = state
            .assets
            .iter()
            .map(AssetBalanceRecord::from_domain)
            .collect::<Result<Vec<_>>>()?;
        self.reserved_usd = state.reserved_usd;
        self.epoch = state.epoch;
        Ok(())
    }

    /// Deserialize this account into a `DWalletState` domain object.
    pub fn to_domain(&self) -> Result<crate::state::DWalletState> {
        Ok(crate::state::DWalletState {
            treasury: self.treasury.to_string(),
            chain: chain_from_code(self.chain)?,
            status: dwallet_status_from_code(self.status)?,
            daily_limit_usd: self.daily_limit_usd,
            per_tx_limit_usd: self.per_tx_limit_usd,
            spent_today_usd: self.spent_today_usd,
            spend_window_start: self.spend_window_start,
            authority: self.authority.to_string(),
            cpi_authority_seed: self.cpi_authority_seed.clone(),
            label: self.label.clone(),
            assets: self
                .assets
                .iter()
                .map(AssetBalanceRecord::to_domain)
                .collect(),
            reserved_usd: self.reserved_usd,
            epoch: self.epoch,
        })
    }
}
