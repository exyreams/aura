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
