use std::fmt::{Display, Formatter};

use aura_policy::Chain;

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
    /// The authority that controls this dWallet (PDA string for on-chain use).
    pub authority: String,
    /// Seed string used to derive the CPI authority PDA.
    pub cpi_authority_seed: String,
    /// On-chain Solana account address of the dWallet PDA (required for live signing).
    pub dwallet_account: Option<String>,
    /// Authorized user public key registered on the dWallet (required for live signing).
    pub authorized_user_pubkey: Option<String>,
    /// Hex-encoded metadata digest for MetadataV2 PDA derivation.
    pub message_metadata_digest: Option<String>,
    /// Hex-encoded raw public key bytes for MetadataV2 PDA derivation.
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
            Chain::Ethereum | Chain::Polygon | Chain::Arbitrum | Chain::Optimism => {
                (DWalletCurve::Secp256k1, SignatureScheme::EcdsaKeccak256)
            }
        }
    }
}
