use std::fmt::{Display, Formatter};

use aura_policy::Chain;

use crate::constants::BALANCE_STALE_THRESHOLD_SECS;
/// Elliptic curve used by a dWallet for key generation and signing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DWalletCurve {
    Secp256k1,
    Secp256r1,
    Ed25519,
    Ristretto,
}

impl Display for DWalletCurve {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::Secp256k1 => "secp256k1",
            Self::Secp256r1 => "secp256r1",
            Self::Ed25519 => "ed25519",
            Self::Ristretto => "ristretto",
        };

        write!(f, "{label}")
    }
}

/// Signing algorithm used by a dWallet.
///
/// The `dwallet_scheme_code` / `from_dwallet_scheme_code` methods convert
/// between this enum and the `u16` code stored in `MessageApproval` accounts
/// and passed in `approve_message` instruction data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureScheme {
    EcdsaKeccak256,
    EcdsaSha256,
    EcdsaDoubleSha256,
    TaprootSha256,
    EcdsaBlake2b256,
    EddsaSha512,
    SchnorrkelMerlin,
}

impl Display for SignatureScheme {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::EcdsaKeccak256 => "ecdsa_keccak256",
            Self::EcdsaSha256 => "ecdsa_sha256",
            Self::EcdsaDoubleSha256 => "ecdsa_double_sha256",
            Self::TaprootSha256 => "taproot_sha256",
            Self::EcdsaBlake2b256 => "ecdsa_blake2b256",
            Self::EddsaSha512 => "eddsa_sha512",
            Self::SchnorrkelMerlin => "schnorrkel_merlin",
        };

        write!(f, "{label}")
    }
}

impl SignatureScheme {
    /// Returns the `u16` scheme code used in dWallet instruction data and
    /// `MessageApproval` account fields.
    pub fn dwallet_scheme_code(self) -> u16 {
        match self {
            Self::EcdsaKeccak256 => 0,
            Self::EcdsaSha256 => 1,
            Self::EcdsaDoubleSha256 => 2,
            Self::TaprootSha256 => 3,
            Self::EcdsaBlake2b256 => 4,
            Self::EddsaSha512 => 5,
            Self::SchnorrkelMerlin => 6,
        }
    }

    /// Converts a raw `u16` scheme code from a `MessageApproval` account back
    /// into a `SignatureScheme`. Returns `None` for unrecognised codes.
    pub fn from_dwallet_scheme_code(code: u16) -> Option<Self> {
        match code {
            0 => Some(Self::EcdsaKeccak256),
            1 => Some(Self::EcdsaSha256),
            2 => Some(Self::EcdsaDoubleSha256),
            3 => Some(Self::TaprootSha256),
            4 => Some(Self::EcdsaBlake2b256),
            5 => Some(Self::EddsaSha512),
            6 => Some(Self::SchnorrkelMerlin),
            _ => None,
        }
    }
}

/// A registered dWallet for one chain on an agent treasury.
///
/// Holds both the static registration data (chain, address, balance) and the
/// optional runtime fields needed for live CPI signing (`dwallet_account`,
/// `authorized_user_pubkey`, `message_metadata_digest`, `public_key_hex`).
/// Runtime fields are populated by `configure_dwallet_runtime` after the
/// dWallet is created on the Ika network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DWalletReference {
    /// Unique identifier for this dWallet within the Ika network.
    pub dwallet_id: String,
    /// Which chain this dWallet holds assets on.
    pub chain: Chain,
    /// Native address of the dWallet on the target chain (e.g. `0x…` for EVM).
    pub address: String,
    /// Current balance in USD, used for policy context.
    pub balance_usd: u64,
    /// Unix timestamp when `balance_usd` was refreshed.
    pub balance_updated_at: i64,
    /// Optional oracle account that is allowed to refresh the stored balance.
    pub balance_oracle: Option<String>,
    /// The authority that controls this dWallet (PDA string for on-chain use).
    pub authority: String,
    /// Seed string used to derive the CPI authority PDA.
    pub cpi_authority_seed: String,
    /// On-chain Solana account address of the dWallet PDA (required for live signing).
    pub dwallet_account: Option<String>,
    /// Authorized user public key registered on the dWallet (required for live signing).
    pub authorized_user_pubkey: Option<String>,
    /// Hex-encoded metadata digest for message approval PDA derivation.
    pub message_metadata_digest: Option<String>,
    /// Hex-encoded raw public key bytes for message approval PDA derivation.
    pub public_key_hex: Option<String>,
    /// Elliptic curve used by this dWallet.
    pub curve: DWalletCurve,
    /// Signing algorithm used by this dWallet.
    pub signature_scheme: SignatureScheme,
}

impl DWalletReference {
    /// Returns the default `(DWalletCurve, SignatureScheme)` pair for `chain`.
    ///
    /// - Solana → Ed25519 / EdDSA-SHA512
    /// - Bitcoin → Secp256k1 / ECDSA-DoubleSHA256
    /// - EVM chains → Secp256k1 / ECDSA-Keccak256
    pub fn chain_defaults(chain: Chain) -> (DWalletCurve, SignatureScheme) {
        match chain {
            Chain::Solana => (DWalletCurve::Ed25519, SignatureScheme::EddsaSha512),
            Chain::Bitcoin => (DWalletCurve::Secp256k1, SignatureScheme::EcdsaDoubleSha256),
            Chain::Ethereum
            | Chain::Polygon
            | Chain::Arbitrum
            | Chain::Optimism
            | Chain::Custom(_) => (DWalletCurve::Secp256k1, SignatureScheme::EcdsaKeccak256),
        }
    }

    pub fn is_balance_stale(&self, now: i64) -> bool {
        now.saturating_sub(self.balance_updated_at) > BALANCE_STALE_THRESHOLD_SECS
    }
}

/// Lifecycle state of a registered dWallet.
///
/// `Active` is required to enter the propose path; the frozen/retiring/retired
/// states reject new outbound spends. Lives in the separate `DWalletAccount`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DWalletStatus {
    /// Registered but runtime fields not yet configured — cannot sign.
    Provisioning,
    /// Fully configured — may propose + sign.
    Active,
    /// Graduated freeze: deposits/reconcile allowed, no outbound signing.
    FrozenOut,
    /// Hard freeze: no signing of any kind.
    Frozen,
    /// Draining only; no new outbound, pending allowed to settle.
    Retiring,
    /// Removed from the active set (record kept until closed).
    Retired,
}

impl DWalletStatus {
    /// Whether this status permits a new outbound proposal.
    pub fn permits_outbound(self) -> bool {
        matches!(self, Self::Active)
    }
}

/// A single asset balance held by a dWallet.
///
/// Stored in the per-dWallet `DWalletAccount`; the treasury keeps only the
/// aggregate `balance_usd` cache. `native_amount` is the raw on-chain unit
/// count; `usd_value` is the priced value used by policy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetBalance {
    pub asset_id: String,
    pub symbol: String,
    pub decimals: u8,
    pub native_amount: u128,
    pub usd_value: u64,
    pub updated_at: i64,
    pub feed: Option<String>,
}

/// The rich per-dWallet runtime state.
///
/// Persisted in its own `DWalletAccount` PDA (`[b"dwallet_state", treasury,
/// chain]`) rather than inline in the treasury, which is hard-capped at 10 KiB.
/// `AgentTreasury.dwallets` keeps the lightweight `DWalletReference`; this holds
/// the controls (status, limits, counters, authority, label) and the multi-asset
/// balance ledger.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DWalletState {
    pub treasury: String,
    pub chain: Chain,
    pub status: DWalletStatus,
    pub daily_limit_usd: Option<u64>,
    pub per_tx_limit_usd: Option<u64>,
    pub spent_today_usd: u64,
    pub spend_window_start: i64,
    pub authority: String,
    pub cpi_authority_seed: String,
    pub label: Option<String>,
    pub assets: Vec<AssetBalance>,
    pub reserved_usd: u64,
    /// Encrypt/oracle epoch marker for the asset feeds.
    pub epoch: u64,
}

impl DWalletState {
    /// Aggregate USD value across all tracked assets.
    pub fn total_usd(&self) -> u64 {
        self.assets
            .iter()
            .fold(0u64, |acc, asset| acc.saturating_add(asset.usd_value))
    }

    /// Spendable USD = aggregate minus reserved.
    pub fn available_usd(&self) -> u64 {
        self.total_usd().saturating_sub(self.reserved_usd)
    }

    /// Per-wallet spent-today, treating the counter as 0 once its window rolled.
    pub fn effective_spent_today(&self, now: i64) -> u64 {
        if now.saturating_sub(self.spend_window_start) >= 86_400 {
            0
        } else {
            self.spent_today_usd
        }
    }

    /// Whether `amount_usd` is within the per-wallet per-tx and daily caps.
    pub fn within_limits(&self, amount_usd: u64, now: i64) -> bool {
        if let Some(per_tx) = self.per_tx_limit_usd {
            if amount_usd > per_tx {
                return false;
            }
        }
        if let Some(daily) = self.daily_limit_usd {
            if self.effective_spent_today(now).saturating_add(amount_usd) > daily {
                return false;
            }
        }
        true
    }

    /// Increments the per-wallet daily spend counter, rolling the window first.
    pub fn record_spend(&mut self, amount_usd: u64, now: i64) {
        if now.saturating_sub(self.spend_window_start) >= 86_400 {
            self.spent_today_usd = 0;
            self.spend_window_start = now;
        }
        self.spent_today_usd = self.spent_today_usd.saturating_add(amount_usd);
    }

    /// Reserves `amount_usd` against available balance. Returns `false` if
    /// available balance can't cover it.
    pub fn reserve(&mut self, amount_usd: u64) -> bool {
        if amount_usd > self.available_usd() {
            return false;
        }
        self.reserved_usd = self.reserved_usd.saturating_add(amount_usd);
        true
    }

    /// Releases a previously reserved amount.
    pub fn release(&mut self, amount_usd: u64) {
        self.reserved_usd = self.reserved_usd.saturating_sub(amount_usd);
    }

    /// Inserts or replaces an asset balance keyed by `asset_id`.
    pub fn upsert_asset(&mut self, asset: AssetBalance) -> Result<(), crate::TreasuryError> {
        if let Some(existing) = self
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == asset.asset_id)
        {
            *existing = asset;
            return Ok(());
        }
        if self.assets.len() >= crate::constants::MAX_ASSETS_PER_WALLET {
            return Err(crate::TreasuryError::InvalidAccountData(
                "asset ledger is full".to_string(),
            ));
        }
        self.assets.push(asset);
        Ok(())
    }

    /// Sets/clears the price feed on a tracked asset. Errors if untracked.
    pub fn set_asset_feed(
        &mut self,
        asset_id: &str,
        feed: Option<String>,
    ) -> Result<(), crate::TreasuryError> {
        let asset = self
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == asset_id)
            .ok_or_else(|| {
                crate::TreasuryError::InvalidAccountData("asset not tracked".to_string())
            })?;
        asset.feed = feed;
        Ok(())
    }
}
