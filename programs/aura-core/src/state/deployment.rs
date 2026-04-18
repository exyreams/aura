use bs58::decode;

use crate::TreasuryError;

/// Devnet Encrypt program ID (pre-alpha).
pub const ENCRYPT_DEVNET_PROGRAM_ID: &str = "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8";
/// Devnet Encrypt gRPC endpoint (pre-alpha).
pub const ENCRYPT_DEVNET_GRPC_ENDPOINT: &str = "pre-alpha-dev-1.encrypt.ika-network.net:443";
/// Devnet dWallet program ID (pre-alpha).
pub const DWALLET_DEVNET_PROGRAM_ID: &str = "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";
/// Devnet dWallet gRPC endpoint (pre-alpha).
pub const DWALLET_DEVNET_GRPC_ENDPOINT: &str = "https://pre-alpha-dev-1.ika.ika-network.net:443";

/// Which on-chain byte layout the dWallet program uses for `MessageApproval` accounts.
///
/// See `cpi/dwallet.rs` for a full description of the two layouts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DWalletMessageApprovalLayout {
    /// Original layout — no metadata digest, `u8` scheme code, no bump.
    LegacyV1,
    /// Current layout — adds metadata digest, `u16` scheme code, bump field.
    MetadataV2,
}

/// Which Solana cluster this deployment targets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeploymentCluster {
    Local,
    Devnet,
    Testnet,
    Mainnet,
    Custom(String),
}

/// Program IDs, gRPC endpoints, and layout settings for one deployment.
///
/// Constructed once per treasury via `devnet_pre_alpha` or `local_testing`,
/// then stored in `AgentTreasury::deployment`. All CPI helpers read program
/// IDs from here rather than hard-coding them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtocolDeployment {
    /// Which cluster this deployment targets.
    pub cluster: DeploymentCluster,
    /// The `aura-core` program ID (base-58). Used as the CPI caller program.
    pub caller_program_id: String,
    /// The Encrypt program ID (base-58).
    pub encrypt_program_id: String,
    /// The dWallet program ID (base-58).
    pub dwallet_program_id: String,
    /// gRPC endpoint for the Encrypt network.
    pub encrypt_grpc_endpoint: String,
    /// gRPC endpoint for the dWallet network.
    pub dwallet_grpc_endpoint: String,
    /// Which `MessageApproval` account layout to use when building CPIs.
    pub dwallet_message_approval_layout: DWalletMessageApprovalLayout,
}

impl ProtocolDeployment {
    /// Creates a deployment with explicit values and validates all fields.
    pub fn new(
        cluster: DeploymentCluster,
        caller_program_id: impl Into<String>,
        encrypt_program_id: impl Into<String>,
        dwallet_program_id: impl Into<String>,
        encrypt_grpc_endpoint: impl Into<String>,
        dwallet_grpc_endpoint: impl Into<String>,
        dwallet_message_approval_layout: DWalletMessageApprovalLayout,
    ) -> Result<Self, TreasuryError> {
        let deployment = Self {
            cluster,
            caller_program_id: caller_program_id.into(),
            encrypt_program_id: encrypt_program_id.into(),
            dwallet_program_id: dwallet_program_id.into(),
            encrypt_grpc_endpoint: encrypt_grpc_endpoint.into(),
            dwallet_grpc_endpoint: dwallet_grpc_endpoint.into(),
            dwallet_message_approval_layout,
        };

        deployment.validate()?;
        Ok(deployment)
    }

    /// Returns a pre-configured deployment for the Ika devnet pre-alpha cluster
    /// using `MetadataV2` message approval layout.
    pub fn devnet_pre_alpha(caller_program_id: impl Into<String>) -> Result<Self, TreasuryError> {
        Self::new(
            DeploymentCluster::Devnet,
            caller_program_id,
            ENCRYPT_DEVNET_PROGRAM_ID,
            DWALLET_DEVNET_PROGRAM_ID,
            ENCRYPT_DEVNET_GRPC_ENDPOINT,
            DWALLET_DEVNET_GRPC_ENDPOINT,
            DWalletMessageApprovalLayout::MetadataV2,
        )
    }

    /// Returns a deployment with synthetic program IDs derived from `label`,
    /// pointing to localhost endpoints. Uses `LegacyV1` layout.
    /// Intended for unit tests only — never panics.
    pub fn local_testing(label: &str) -> Self {
        let caller_program_id = synthetic_program_id(&format!("{label}:caller"));
        let encrypt_program_id = synthetic_program_id(&format!("{label}:encrypt"));
        let dwallet_program_id = synthetic_program_id(&format!("{label}:dwallet"));

        Self::new(
            DeploymentCluster::Local,
            caller_program_id,
            encrypt_program_id,
            dwallet_program_id,
            "http://127.0.0.1:4430",
            "http://127.0.0.1:4440",
            DWalletMessageApprovalLayout::LegacyV1,
        )
        .expect("local deployment should always validate")
    }

    /// Validates all program IDs and endpoints. Called automatically by `new`.
    pub fn validate(&self) -> Result<(), TreasuryError> {
        validate_program_id("caller_program_id", &self.caller_program_id)?;
        validate_program_id("encrypt_program_id", &self.encrypt_program_id)?;
        validate_program_id("dwallet_program_id", &self.dwallet_program_id)?;
        validate_endpoint("encrypt_grpc_endpoint", &self.encrypt_grpc_endpoint)?;
        validate_endpoint("dwallet_grpc_endpoint", &self.dwallet_grpc_endpoint)?;
        Ok(())
    }
}

fn validate_program_id(label: &str, program_id: &str) -> Result<(), TreasuryError> {
    if program_id.trim().is_empty() || program_id.contains("TODO") {
        return Err(TreasuryError::InvalidProgramId(format!(
            "{label} must be a deployed base58 pubkey"
        )));
    }

    let decoded = decode(program_id)
        .into_vec()
        .map_err(|_| TreasuryError::InvalidProgramId(format!("{label} is not valid base58")))?;

    if decoded.len() != 32 {
        return Err(TreasuryError::InvalidProgramId(format!(
            "{label} must decode to 32 bytes"
        )));
    }

    Ok(())
}

fn validate_endpoint(label: &str, endpoint: &str) -> Result<(), TreasuryError> {
    let bare_host_port = !endpoint.contains("://")
        && !endpoint.contains('/')
        && endpoint.contains(':')
        && !endpoint.contains(' ');
    let allowed = endpoint.starts_with("https://")
        || endpoint.starts_with("http://127.0.0.1:")
        || endpoint.starts_with("http://localhost:")
        || bare_host_port;

    if !allowed {
        return Err(TreasuryError::InvalidEndpoint(format!(
            "{label} must be https or localhost http"
        )));
    }

    Ok(())
}

fn synthetic_program_id(label: &str) -> String {
    use sha2::{Digest, Sha256};

    let digest = Sha256::digest(label.as_bytes());
    bs58::encode(digest).into_string()
}
