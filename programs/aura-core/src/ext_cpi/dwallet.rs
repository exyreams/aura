use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    },
};

use crate::{
    execution::{build_chain_message, keccak_message_digest},
    state::{
        DWalletCurve, DWalletMessageApprovalLayout, DWalletReference, PendingSignatureRequest,
        PendingTransaction, SignatureScheme,
    },
    TreasuryError,
};

type TreasuryResult<T> = std::result::Result<T, TreasuryError>;

/// Seed used to derive the CPI authority PDA that signs on behalf of aura-core.
/// Must match the seed expected by the dWallet program's CPI authority check.
pub const DWALLET_CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

/// Seed for the dWallet coordinator PDA, required by the MetadataV2 approve-message
/// instruction as an additional read-only account.
pub const DWALLET_COORDINATOR_SEED: &[u8] = b"dwallet_coordinator";

/// Seed prefix used when deriving the dWallet PDA itself (part of the V2 PDA seeds).
pub const DWALLET_SEED: &[u8] = b"dwallet";

/// Seed used to derive the `MessageApproval` PDA for both layout versions.
pub const MESSAGE_APPROVAL_SEED: &[u8] = b"message_approval";

/// Instruction discriminator for `approve_message` in the dWallet program.
pub const IX_APPROVE_MESSAGE: u8 = 8;

/// Instruction discriminator for `transfer_ownership` in the dWallet program.
pub const IX_TRANSFER_OWNERSHIP: u8 = 24;

/// Instruction discriminator for `transfer_future_sign` in the dWallet program.
pub const IX_TRANSFER_FUTURE_SIGN: u8 = 42;

/// First byte of every `MessageApproval` account — identifies the account type.
pub const MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR: u8 = 14;

/// Second byte of every `MessageApproval` account — the schema version written
/// by the dWallet program. Currently always `1` regardless of layout variant.
pub const MESSAGE_APPROVAL_ACCOUNT_VERSION: u8 = 1;

/// Fixed byte length of a fully-populated MetadataV2 `MessageApproval` account
/// (128-byte ECDSA/EdDSA signature + all header fields).
pub const MESSAGE_APPROVAL_ACCOUNT_LEN_V2: usize = 312;

/// Minimum byte length of a LegacyV1 `MessageApproval` account
/// (header fields only; signature bytes follow immediately after).
pub const MESSAGE_APPROVAL_ACCOUNT_MIN_LEN_V1: usize = 142;

// MetadataV2 account field offsets
//
// Layout (bytes):
//   [0]       discriminator
//   [1]       version
//   [2..34]   dwallet pubkey
//   [34..66]  message_digest
//   [66..98]  message_metadata_digest   ← added in V2; shifts all later fields by 32
//   [98..130] approver pubkey
//   [130..162] user_pubkey
//   [162..164] signature_scheme (u16 LE)
//   [164..172] epoch (u64 LE)
//   [172]     status (u8)
//   [173..175] signature_len (u16 LE)
//   [175..303] signature bytes (128 bytes max)
//   [303]     bump
const V2_OFFSET_DWALLET: usize = 2;
const V2_OFFSET_MESSAGE_DIGEST: usize = 34;
const V2_OFFSET_MESSAGE_METADATA_DIGEST: usize = 66;
const V2_OFFSET_APPROVER: usize = 98;
const V2_OFFSET_USER_PUBKEY: usize = 130;
const V2_OFFSET_SIGNATURE_SCHEME: usize = 162;
const V2_OFFSET_EPOCH: usize = 164;
const V2_OFFSET_STATUS: usize = 172;
const V2_OFFSET_SIGNATURE_LEN: usize = 173;
const V2_OFFSET_SIGNATURE: usize = 175;
const V2_OFFSET_BUMP: usize = 303;

// LegacyV1 account field offsets
//
// Layout (bytes):
//   [0]       discriminator
//   [1]       version
//   [2..34]   dwallet pubkey
//   [34..66]  message_digest            ← no metadata digest field
//   [66..98]  approver pubkey
//   [98..130] user_pubkey
//   [130]     signature_scheme (u8, not u16)
//   [131..139] epoch (u64 LE)
//   [139]     status (u8)
//   [140..142] signature_len (u16 LE)
//   [142+]    signature bytes
const V1_OFFSET_DWALLET: usize = 2;
const V1_OFFSET_MESSAGE_DIGEST: usize = 34;
const V1_OFFSET_APPROVER: usize = 66;
const V1_OFFSET_USER_PUBKEY: usize = 98;
const V1_OFFSET_SIGNATURE_SCHEME: usize = 130;
const V1_OFFSET_EPOCH: usize = 131;
const V1_OFFSET_STATUS: usize = 139;
const V1_OFFSET_SIGNATURE_LEN: usize = 140;
const V1_OFFSET_SIGNATURE: usize = 142;

/// Upper bound on signature byte length; guards against malformed account data.
const MAX_SIGNATURE_LEN: usize = 128;

/// Whether the dWallet network has produced a signature for a message approval.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageApprovalStatus {
    /// The approval account exists but the network has not yet signed.
    Pending,
    /// The network has signed; `OnchainMessageApproval::signature` is populated.
    Signed,
}

/// All data needed to submit an `approve_message` CPI to the dWallet program.
///
/// Built by `build_message_approval_request` from a `PendingTransaction` and
/// the treasury's `DWalletReference`. The caller passes this to
/// `approve_message_via_cpi` and stores the derived fields in a
/// `PendingSignatureRequest` on the treasury account.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageApprovalRequest {
    /// Which on-chain account layout to use when building the CPI instruction.
    pub layout: DWalletMessageApprovalLayout,
    /// The coordinator PDA required by MetadataV2; `None` for LegacyV1.
    pub coordinator_account: Option<Pubkey>,
    /// Human-readable chain message string (used for digest derivation and audit).
    pub message: String,
    /// Keccak-256 digest of `message`, passed as instruction data.
    pub message_digest: [u8; 32],
    /// Hex-encoded form of `message_digest`, stored in `PendingSignatureRequest`.
    pub message_digest_hex: String,
    /// Metadata digest from `DWalletReference::message_metadata_digest`, or all-zeros
    /// for LegacyV1 / when no metadata digest is configured.
    pub message_metadata_digest: [u8; 32],
    /// Hex-encoded form of `message_metadata_digest`.
    pub message_metadata_digest_hex: String,
    /// Signature scheme (ECDSA / EdDSA) used by this dWallet.
    pub signature_scheme: SignatureScheme,
    /// The derived `MessageApproval` PDA address.
    pub message_approval_account: Pubkey,
    /// Bump seed for `message_approval_account`.
    pub message_approval_bump: u8,
    /// Stable string identifier for this approval, used in audit events.
    pub approval_id: String,
}

/// Parsed representation of a `MessageApproval` account read from the dWallet program.
///
/// Produced by `parse_message_approval_account`, which tries the MetadataV2
/// layout first and falls back to LegacyV1 for accounts created by older
/// dWallet program deployments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OnchainMessageApproval {
    /// Which byte layout was used to parse this account.
    pub layout: DWalletMessageApprovalLayout,
    /// The dWallet account this approval belongs to.
    pub dwallet: Pubkey,
    /// Keccak-256 digest of the signed message.
    pub message_digest: [u8; 32],
    /// Metadata digest included in the V2 PDA derivation; all-zeros for LegacyV1.
    pub message_metadata_digest: [u8; 32],
    /// The CPI authority that submitted the approval request.
    pub approver: Pubkey,
    /// The authorized user public key registered on the dWallet.
    pub user_pubkey: Pubkey,
    /// Signature scheme used to produce the signature.
    pub signature_scheme: SignatureScheme,
    /// Ika network epoch at the time of signing.
    pub epoch: u64,
    /// Whether the network has produced a signature yet.
    pub status: MessageApprovalStatus,
    /// Raw signature bytes; non-empty only when `status == Signed`.
    pub signature: Vec<u8>,
    /// PDA bump; always `0` for LegacyV1 accounts (field did not exist).
    pub bump: u8,
}

/// Derives all fields needed to call `approve_message` on the dWallet program.
///
/// Builds the chain message from `pending` and `dwallet`, computes its
/// Keccak-256 digest, resolves the metadata digest (or uses all-zeros for
/// LegacyV1), and derives the `MessageApproval` PDA using the appropriate
/// seed scheme for `layout`.
///
/// Returns a `MessageApprovalRequest` ready to be passed to
/// `approve_message_via_cpi` and stored as a `PendingSignatureRequest`.
pub fn build_message_approval_request(
    pending: &PendingTransaction,
    dwallet: &DWalletReference,
    dwallet_program_id: &Pubkey,
    layout: DWalletMessageApprovalLayout,
) -> TreasuryResult<MessageApprovalRequest> {
    let dwallet_account = parse_runtime_pubkey(
        dwallet.dwallet_account.as_deref(),
        "dwallet_account must be configured for live dWallet signing",
    )?;
    let message = build_chain_message(pending, dwallet);
    let message_digest = keccak_message_digest(&message);
    let message_digest_hex = hex::encode(message_digest);
    let message_metadata_digest_hex = dwallet
        .message_metadata_digest
        .clone()
        .unwrap_or_else(zero_message_metadata_digest_hex);
    let message_metadata_digest = decode_digest_hex(
        &message_metadata_digest_hex,
        "message_metadata_digest must be a 32-byte hex digest",
    )?;

    let (message_approval_account, message_approval_bump, coordinator_account) = match layout {
        DWalletMessageApprovalLayout::LegacyV1 => {
            let (approval, bump) =
                find_message_approval_pda_v1(&dwallet_account, &message_digest, dwallet_program_id);
            (approval, bump, None)
        }
        DWalletMessageApprovalLayout::MetadataV2 => {
            let (approval, bump) = find_message_approval_pda_v2(
                dwallet,
                &message_digest,
                &message_metadata_digest,
                dwallet_program_id,
            )?;
            let (coordinator, _) =
                Pubkey::find_program_address(&[DWALLET_COORDINATOR_SEED], dwallet_program_id);
            (approval, bump, Some(coordinator))
        }
    };

    Ok(MessageApprovalRequest {
        layout,
        coordinator_account,
        approval_id: format!("msgappr_{message_approval_account}"),
        message,
        message_digest,
        message_digest_hex,
        message_metadata_digest,
        message_metadata_digest_hex,
        signature_scheme: dwallet.signature_scheme,
        message_approval_account,
        message_approval_bump,
    })
}

/// Submits an `approve_message` CPI to the dWallet program.
///
/// Builds the instruction data and account list for the given `layout`,
/// then calls `invoke_signed` with the CPI authority PDA as the signer.
///
/// - `LegacyV1`: 6-account instruction; `signature_scheme` encoded as `u8`.
/// - `MetadataV2`: 7-account instruction (adds `coordinator`); `signature_scheme`
///   encoded as `u16 LE`; `message_metadata_digest` included in instruction data.
///
/// The dWallet network processes the approval asynchronously. Poll
/// `parse_message_approval_account` until `status == Signed` before calling
/// `finalize_execution`.
#[allow(clippy::too_many_arguments)]
pub fn approve_message_via_cpi<'info>(
    layout: DWalletMessageApprovalLayout,
    dwallet_program: &AccountInfo<'info>,
    coordinator: Option<&AccountInfo<'info>>,
    message_approval: &AccountInfo<'info>,
    dwallet: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    cpi_authority_bump: u8,
    message_digest: [u8; 32],
    message_metadata_digest: [u8; 32],
    user_pubkey: [u8; 32],
    signature_scheme: SignatureScheme,
    approval_bump: u8,
) -> Result<()> {
    let (accounts, account_infos, data) = match layout {
        DWalletMessageApprovalLayout::LegacyV1 => {
            let mut ix_data = Vec::with_capacity(67);
            ix_data.push(IX_APPROVE_MESSAGE);
            ix_data.push(approval_bump);
            ix_data.extend_from_slice(&message_digest);
            ix_data.extend_from_slice(&user_pubkey);
            ix_data.push(signature_scheme.dwallet_scheme_code() as u8);

            (
                vec![
                    AccountMeta::new(message_approval.key(), false),
                    AccountMeta::new_readonly(dwallet.key(), false),
                    AccountMeta::new_readonly(caller_program.key(), false),
                    AccountMeta::new_readonly(cpi_authority.key(), true),
                    AccountMeta::new(payer.key(), true),
                    AccountMeta::new_readonly(system_program.key(), false),
                ],
                vec![
                    message_approval.clone(),
                    dwallet.clone(),
                    caller_program.clone(),
                    cpi_authority.clone(),
                    payer.clone(),
                    system_program.clone(),
                    dwallet_program.clone(),
                ],
                ix_data,
            )
        }
        DWalletMessageApprovalLayout::MetadataV2 => {
            let Some(coordinator) = coordinator else {
                return err!(crate::AuraCoreError::InvalidExternalAccountData);
            };

            let mut ix_data = Vec::with_capacity(100);
            ix_data.push(IX_APPROVE_MESSAGE);
            ix_data.push(approval_bump);
            ix_data.extend_from_slice(&message_digest);
            ix_data.extend_from_slice(&message_metadata_digest);
            ix_data.extend_from_slice(&user_pubkey);
            ix_data.extend_from_slice(&signature_scheme.dwallet_scheme_code().to_le_bytes());

            (
                vec![
                    AccountMeta::new_readonly(coordinator.key(), false),
                    AccountMeta::new(message_approval.key(), false),
                    AccountMeta::new_readonly(dwallet.key(), false),
                    AccountMeta::new_readonly(caller_program.key(), false),
                    AccountMeta::new_readonly(cpi_authority.key(), true),
                    AccountMeta::new(payer.key(), true),
                    AccountMeta::new_readonly(system_program.key(), false),
                ],
                vec![
                    coordinator.clone(),
                    message_approval.clone(),
                    dwallet.clone(),
                    caller_program.clone(),
                    cpi_authority.clone(),
                    payer.clone(),
                    system_program.clone(),
                    dwallet_program.clone(),
                ],
                ix_data,
            )
        }
    };

    let ix = Instruction {
        program_id: dwallet_program.key(),
        accounts,
        data,
    };

    let seeds = &[DWALLET_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    let signer_seeds = &[&seeds[..]];
    invoke_signed(&ix, &account_infos, signer_seeds)?;
    Ok(())
}

/// Transfers ownership of a dWallet to a new authority via CPI.
///
/// Calls the `transfer_ownership` instruction (discriminator `24`) on the
/// dWallet program. Used during treasury migration or emergency handover.
/// The CPI authority PDA signs the transfer.
pub fn transfer_dwallet_via_cpi<'info>(
    dwallet_program: &AccountInfo<'info>,
    dwallet: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    cpi_authority_bump: u8,
    new_authority: &Pubkey,
) -> Result<()> {
    let mut ix_data = Vec::with_capacity(33);
    ix_data.push(IX_TRANSFER_OWNERSHIP);
    ix_data.extend_from_slice(new_authority.as_ref());

    let ix = Instruction {
        program_id: dwallet_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(caller_program.key(), false),
            AccountMeta::new_readonly(cpi_authority.key(), true),
            AccountMeta::new(dwallet.key(), false),
        ],
        data: ix_data,
    };

    let account_infos = vec![
        caller_program.clone(),
        cpi_authority.clone(),
        dwallet.clone(),
        dwallet_program.clone(),
    ];
    let seeds = &[DWALLET_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    let signer_seeds = &[&seeds[..]];
    invoke_signed(&ix, &account_infos, signer_seeds)?;
    Ok(())
}

/// Transfers the future-sign capability of a partial user signature account
/// to a new authority via CPI.
///
/// Calls the `transfer_future_sign` instruction (discriminator `42`) on the
/// dWallet program. The CPI authority PDA signs the transfer.
pub fn transfer_future_sign_via_cpi<'info>(
    dwallet_program: &AccountInfo<'info>,
    partial_user_sig: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    cpi_authority_bump: u8,
    new_authority: &Pubkey,
) -> Result<()> {
    let mut ix_data = Vec::with_capacity(33);
    ix_data.push(IX_TRANSFER_FUTURE_SIGN);
    ix_data.extend_from_slice(new_authority.as_ref());

    let ix = Instruction {
        program_id: dwallet_program.key(),
        accounts: vec![
            AccountMeta::new(partial_user_sig.key(), false),
            AccountMeta::new_readonly(caller_program.key(), false),
            AccountMeta::new_readonly(cpi_authority.key(), true),
        ],
        data: ix_data,
    };

    let account_infos = vec![
        partial_user_sig.clone(),
        caller_program.clone(),
        cpi_authority.clone(),
        dwallet_program.clone(),
    ];
    let seeds = &[DWALLET_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    let signer_seeds = &[&seeds[..]];
    invoke_signed(&ix, &account_infos, signer_seeds)?;
    Ok(())
}

/// Parses a raw `MessageApproval` account from the dWallet program.
///
/// Validates the discriminator and version bytes, then attempts to parse
/// using the MetadataV2 layout. If the account is too short for V2 (i.e. it
/// was created by an older dWallet deployment), falls back to LegacyV1.
///
/// Returns `TreasuryError::InvalidAccountData` if neither layout matches.
pub fn parse_message_approval_account(data: &[u8]) -> TreasuryResult<OnchainMessageApproval> {
    if data.is_empty() {
        return Err(TreasuryError::InvalidAccountData(
            "message approval account is empty".to_string(),
        ));
    }

    if data[0] != MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR {
        return Err(TreasuryError::InvalidAccountData(format!(
            "unexpected message approval discriminator {}",
            data[0]
        )));
    }

    if data.get(1).copied() != Some(MESSAGE_APPROVAL_ACCOUNT_VERSION) {
        return Err(TreasuryError::InvalidAccountData(format!(
            "unexpected message approval version {}",
            data.get(1).copied().unwrap_or_default()
        )));
    }

    parse_message_approval_account_v2(data).or_else(|_| parse_message_approval_account_v1(data))
}

/// Verifies that a parsed `MessageApproval` matches the stored `PendingSignatureRequest`.
///
/// Checks, in order:
/// 1. The approval status is `Signed`.
/// 2. The approval account address matches the stored request.
/// 3. The dWallet account matches the registered dWallet.
/// 4. The signature scheme matches.
/// 5. The approver matches the treasury's CPI authority.
/// 6. The user pubkey matches the registered runtime metadata.
/// 7. Both message digests match.
/// 8. The signature bytes are non-empty.
///
/// Returns `TreasuryError::MessageApprovalNotReady` if the network has not
/// yet signed, or `TreasuryError::SignatureVerificationFailed` / `InvalidAccountData`
/// for any mismatch.
pub fn verify_message_approval(
    approval_account: &Pubkey,
    approval: &OnchainMessageApproval,
    expected_request: &PendingSignatureRequest,
    expected_approver: &Pubkey,
    expected_user_pubkey: &Pubkey,
) -> TreasuryResult<()> {
    if approval.status != MessageApprovalStatus::Signed {
        return Err(TreasuryError::MessageApprovalNotReady);
    }

    if expected_request.message_approval_account != approval_account.to_string() {
        return Err(TreasuryError::InvalidAccountData(
            "message approval account does not match pending signature request".to_string(),
        ));
    }

    if expected_request.dwallet_account != approval.dwallet.to_string() {
        return Err(TreasuryError::InvalidAccountData(
            "message approval dwallet does not match registered dwallet".to_string(),
        ));
    }

    if expected_request.signature_scheme != approval.signature_scheme {
        return Err(TreasuryError::SignatureVerificationFailed);
    }

    if approval.approver != *expected_approver {
        return Err(TreasuryError::InvalidAccountData(
            "message approval approver does not match CPI authority".to_string(),
        ));
    }

    if approval.user_pubkey != *expected_user_pubkey {
        return Err(TreasuryError::InvalidAccountData(
            "message approval user pubkey does not match registered runtime metadata".to_string(),
        ));
    }

    if expected_request.message_digest != hex::encode(approval.message_digest) {
        return Err(TreasuryError::SignatureVerificationFailed);
    }

    if expected_request.message_metadata_digest != hex::encode(approval.message_metadata_digest) {
        return Err(TreasuryError::SignatureVerificationFailed);
    }

    if approval.signature.is_empty() {
        return Err(TreasuryError::MessageApprovalNotReady);
    }

    Ok(())
}

/// Constructs a `PendingSignatureRequest` from a freshly submitted approval request.
///
/// Called immediately after `approve_message_via_cpi` succeeds. The returned
/// value is stored on the `PendingTransaction` so that `finalize_execution`
/// can later locate and verify the approval account.
pub fn pending_signature_request_from_live(
    approval_request: &MessageApprovalRequest,
    dwallet_account: &Pubkey,
    requested_at: i64,
) -> PendingSignatureRequest {
    PendingSignatureRequest {
        dwallet_account: dwallet_account.to_string(),
        message_approval_account: approval_request.message_approval_account.to_string(),
        approval_id: approval_request.approval_id.clone(),
        message_digest: approval_request.message_digest_hex.clone(),
        message_metadata_digest: approval_request.message_metadata_digest_hex.clone(),
        signature_scheme: approval_request.signature_scheme,
        requested_at,
    }
}

/// Returns the hex-encoded all-zeros 32-byte digest used when no metadata digest
/// is configured on a `DWalletReference`.
pub fn zero_message_metadata_digest_hex() -> String {
    hex::encode([0u8; 32])
}

/// Decodes a hex string into a 32-byte digest array.
///
/// Returns `TreasuryError::InvalidAccountData` with `error_message` if the
/// string is not valid hex or does not decode to exactly 32 bytes.
pub fn decode_digest_hex(value: &str, error_message: &str) -> TreasuryResult<[u8; 32]> {
    let decoded = hex::decode(value)
        .map_err(|_| TreasuryError::InvalidAccountData(error_message.to_string()))?;
    decoded
        .try_into()
        .map_err(|_| TreasuryError::InvalidAccountData(error_message.to_string()))
}

/// Parses an optional string into a `Pubkey`.
///
/// Returns `TreasuryError::InvalidAccountData` with `error_message` if the
/// value is `None` or is not a valid base-58 public key.
pub fn parse_runtime_pubkey(value: Option<&str>, error_message: &str) -> TreasuryResult<Pubkey> {
    let Some(value) = value else {
        return Err(TreasuryError::InvalidAccountData(error_message.to_string()));
    };

    value
        .parse()
        .map_err(|_| TreasuryError::InvalidAccountData(error_message.to_string()))
}

/// Derives the LegacyV1 `MessageApproval` PDA.
///
/// Seeds: `[MESSAGE_APPROVAL_SEED, dwallet_account, message_digest]`
fn find_message_approval_pda_v1(
    dwallet_account: &Pubkey,
    message_digest: &[u8; 32],
    dwallet_program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            MESSAGE_APPROVAL_SEED,
            dwallet_account.as_ref(),
            message_digest,
        ],
        dwallet_program_id,
    )
}

/// Derives the MetadataV2 `MessageApproval` PDA.
///
/// Seeds: `[DWALLET_SEED, <curve_code_le>, <public_key_chunks…>,
///          MESSAGE_APPROVAL_SEED, <scheme_le>, message_digest,
///          (message_metadata_digest if non-zero)]`
///
/// Requires `dwallet.public_key_hex` to be set; returns
/// `TreasuryError::InvalidAccountData` otherwise.
fn find_message_approval_pda_v2(
    dwallet: &DWalletReference,
    message_digest: &[u8; 32],
    message_metadata_digest: &[u8; 32],
    dwallet_program_id: &Pubkey,
) -> TreasuryResult<(Pubkey, u8)> {
    let public_key_hex = dwallet.public_key_hex.as_deref().ok_or_else(|| {
        TreasuryError::InvalidAccountData(
            "dwallet public_key_hex must be configured for metadata-v2 signing".to_string(),
        )
    })?;
    let public_key = hex::decode(public_key_hex).map_err(|_| {
        TreasuryError::InvalidAccountData(
            "dwallet public_key_hex must contain valid hex bytes".to_string(),
        )
    })?;

    let mut payload = Vec::with_capacity(2 + public_key.len());
    payload.extend_from_slice(&curve_seed_code(dwallet.curve).to_le_bytes());
    payload.extend_from_slice(&public_key);

    let scheme = dwallet.signature_scheme.dwallet_scheme_code().to_le_bytes();
    let include_metadata = message_metadata_digest.iter().any(|byte| *byte != 0);

    // Build seed list: DWALLET_SEED + public-key chunks (32 bytes each) +
    // MESSAGE_APPROVAL_SEED + scheme + message_digest + optional metadata_digest.
    let mut owned_seeds = Vec::with_capacity(6);
    owned_seeds.push(DWALLET_SEED.to_vec());
    for chunk in payload.chunks(32) {
        owned_seeds.push(chunk.to_vec());
    }
    owned_seeds.push(MESSAGE_APPROVAL_SEED.to_vec());
    owned_seeds.push(scheme.to_vec());
    owned_seeds.push(message_digest.to_vec());
    if include_metadata {
        owned_seeds.push(message_metadata_digest.to_vec());
    }

    let seed_refs = owned_seeds.iter().map(Vec::as_slice).collect::<Vec<_>>();
    Ok(Pubkey::find_program_address(&seed_refs, dwallet_program_id))
}

/// Parses a `MessageApproval` account using the MetadataV2 byte layout.
///
/// Fails if the account is shorter than `MESSAGE_APPROVAL_ACCOUNT_LEN_V2`.
/// Called first by `parse_message_approval_account`; LegacyV1 is the fallback.
fn parse_message_approval_account_v2(data: &[u8]) -> TreasuryResult<OnchainMessageApproval> {
    if data.len() < MESSAGE_APPROVAL_ACCOUNT_LEN_V2 {
        return Err(TreasuryError::InvalidAccountData(format!(
            "message approval length {} is smaller than expected {}",
            data.len(),
            MESSAGE_APPROVAL_ACCOUNT_LEN_V2
        )));
    }

    let signature_len = read_signature_len(data, V2_OFFSET_SIGNATURE_LEN)?;
    let scheme_code = u16::from_le_bytes(
        data[V2_OFFSET_SIGNATURE_SCHEME..V2_OFFSET_SIGNATURE_SCHEME + 2]
            .try_into()
            .map_err(|_| TreasuryError::InvalidAccountData("missing scheme code".to_string()))?,
    );
    let signature_scheme = signature_scheme_from_code(scheme_code)?;
    let epoch = u64::from_le_bytes(
        data[V2_OFFSET_EPOCH..V2_OFFSET_EPOCH + 8]
            .try_into()
            .map_err(|_| TreasuryError::InvalidAccountData("missing epoch".to_string()))?,
    );

    Ok(OnchainMessageApproval {
        layout: DWalletMessageApprovalLayout::MetadataV2,
        dwallet: read_pubkey(data, V2_OFFSET_DWALLET)?,
        message_digest: read_digest(data, V2_OFFSET_MESSAGE_DIGEST)?,
        message_metadata_digest: read_digest(data, V2_OFFSET_MESSAGE_METADATA_DIGEST)?,
        approver: read_pubkey(data, V2_OFFSET_APPROVER)?,
        user_pubkey: read_pubkey(data, V2_OFFSET_USER_PUBKEY)?,
        signature_scheme,
        epoch,
        status: approval_status_from_byte(data[V2_OFFSET_STATUS])?,
        signature: read_signature_bytes(data, V2_OFFSET_SIGNATURE, signature_len)?,
        bump: data[V2_OFFSET_BUMP],
    })
}

/// Parses a `MessageApproval` account using the LegacyV1 byte layout.
///
/// Used as a fallback for accounts created by older dWallet program deployments
/// that predate the MetadataV2 format. Key differences from V2:
/// - No `message_metadata_digest` field (returned as all-zeros).
/// - `signature_scheme` is a single `u8`, not a `u16`.
/// - No `bump` field (returned as `0`).
fn parse_message_approval_account_v1(data: &[u8]) -> TreasuryResult<OnchainMessageApproval> {
    if data.len() < MESSAGE_APPROVAL_ACCOUNT_MIN_LEN_V1 {
        return Err(TreasuryError::InvalidAccountData(format!(
            "legacy message approval length {} is smaller than expected {}",
            data.len(),
            MESSAGE_APPROVAL_ACCOUNT_MIN_LEN_V1
        )));
    }

    let signature_len = read_signature_len(data, V1_OFFSET_SIGNATURE_LEN)?;
    let signature_scheme = signature_scheme_from_code(
        data.get(V1_OFFSET_SIGNATURE_SCHEME)
            .copied()
            .ok_or_else(|| TreasuryError::InvalidAccountData("missing scheme code".to_string()))?
            as u16,
    )?;
    let epoch = u64::from_le_bytes(
        data[V1_OFFSET_EPOCH..V1_OFFSET_EPOCH + 8]
            .try_into()
            .map_err(|_| TreasuryError::InvalidAccountData("missing epoch".to_string()))?,
    );

    Ok(OnchainMessageApproval {
        layout: DWalletMessageApprovalLayout::LegacyV1,
        dwallet: read_pubkey(data, V1_OFFSET_DWALLET)?,
        message_digest: read_digest(data, V1_OFFSET_MESSAGE_DIGEST)?,
        message_metadata_digest: [0u8; 32],
        approver: read_pubkey(data, V1_OFFSET_APPROVER)?,
        user_pubkey: read_pubkey(data, V1_OFFSET_USER_PUBKEY)?,
        signature_scheme,
        epoch,
        status: approval_status_from_byte(data[V1_OFFSET_STATUS])?,
        signature: read_signature_bytes(data, V1_OFFSET_SIGNATURE, signature_len)?,
        bump: 0,
    })
}

/// Maps a `DWalletCurve` variant to the 2-byte little-endian seed code used
/// in the MetadataV2 PDA derivation.
fn curve_seed_code(curve: DWalletCurve) -> u16 {
    match curve {
        DWalletCurve::Secp256k1 => 0,
        DWalletCurve::Secp256r1 => 1,
        DWalletCurve::Ed25519 => 2,
        DWalletCurve::Ristretto => 3,
    }
}

/// Reads the 2-byte LE signature length from `data[offset..offset+2]` and
/// validates it does not exceed `MAX_SIGNATURE_LEN`.
fn read_signature_len(data: &[u8], offset: usize) -> TreasuryResult<usize> {
    let signature_len =
        u16::from_le_bytes(data[offset..offset + 2].try_into().map_err(|_| {
            TreasuryError::InvalidAccountData("missing signature length".to_string())
        })?) as usize;
    if signature_len > MAX_SIGNATURE_LEN {
        return Err(TreasuryError::InvalidAccountData(format!(
            "signature length {} exceeds {}",
            signature_len, MAX_SIGNATURE_LEN
        )));
    }

    Ok(signature_len)
}

/// Copies `signature_len` bytes starting at `data[offset]` into a `Vec<u8>`.
///
/// Returns `TreasuryError::InvalidAccountData` if the slice would exceed the
/// buffer length.
fn read_signature_bytes(
    data: &[u8],
    offset: usize,
    signature_len: usize,
) -> TreasuryResult<Vec<u8>> {
    let end = offset + signature_len;
    if end > data.len() {
        return Err(TreasuryError::InvalidAccountData(
            "message approval signature bytes are truncated".to_string(),
        ));
    }

    Ok(data[offset..end].to_vec())
}

/// Converts the raw status byte from a `MessageApproval` account into the
/// typed `MessageApprovalStatus` enum.
fn approval_status_from_byte(value: u8) -> TreasuryResult<MessageApprovalStatus> {
    match value {
        0 => Ok(MessageApprovalStatus::Pending),
        1 => Ok(MessageApprovalStatus::Signed),
        other => Err(TreasuryError::InvalidAccountData(format!(
            "unsupported message approval status {other}"
        ))),
    }
}

/// Converts a raw scheme code (as stored in the account) into a `SignatureScheme`.
///
/// Returns `TreasuryError::InvalidAccountData` for unrecognised codes.
fn signature_scheme_from_code(code: u16) -> TreasuryResult<SignatureScheme> {
    SignatureScheme::from_dwallet_scheme_code(code).ok_or_else(|| {
        TreasuryError::InvalidAccountData(format!("unsupported signature scheme code {code}"))
    })
}

/// Reads a 32-byte public key from `data` at `offset` and wraps it in a `Pubkey`.
fn read_pubkey(data: &[u8], offset: usize) -> TreasuryResult<Pubkey> {
    let bytes: [u8; 32] = data[offset..offset + 32]
        .try_into()
        .map_err(|_| TreasuryError::InvalidAccountData(format!("missing pubkey at {offset}")))?;
    Ok(Pubkey::new_from_array(bytes))
}

/// Reads a 32-byte digest from `data` at `offset`.
fn read_digest(data: &[u8], offset: usize) -> TreasuryResult<[u8; 32]> {
    data[offset..offset + 32]
        .try_into()
        .map_err(|_| TreasuryError::InvalidAccountData(format!("missing digest at {offset}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_pending() -> PendingTransaction {
        PendingTransaction {
            proposal_id: 7,
            proposal_digest: "proposal".to_string(),
            policy_graph_name: "graph".to_string(),
            policy_output_digest: "digest".to_string(),
            policy_output_ciphertext_account: None,
            policy_output_fhe_type: None,
            target_chain: aura_policy::Chain::Ethereum,
            tx_type: aura_policy::TransactionType::Transfer,
            amount_usd: 1_000,
            recipient_or_contract: "0xrecipient".to_string(),
            protocol_id: None,
            submitted_at: 1,
            expires_at: 2,
            last_updated_at: 1,
            execution_attempts: 0,
            status: crate::state::ProposalStatus::Proposed,
            decryption_request: None,
            signature_request: None,
            decision: aura_policy::PolicyDecision {
                approved: true,
                violation: aura_policy::ViolationCode::None,
                effective_daily_limit_usd: 10_000,
                next_state: Default::default(),
                trace: vec![],
            },
        }
    }

    #[test]
    fn parse_message_approval_layout_v2() {
        let dwallet = Pubkey::new_unique();
        let approver = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        let mut data = vec![0u8; MESSAGE_APPROVAL_ACCOUNT_LEN_V2];
        data[0] = MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR;
        data[1] = MESSAGE_APPROVAL_ACCOUNT_VERSION;
        data[V2_OFFSET_DWALLET..V2_OFFSET_DWALLET + 32].copy_from_slice(dwallet.as_ref());
        data[V2_OFFSET_MESSAGE_DIGEST..V2_OFFSET_MESSAGE_DIGEST + 32].copy_from_slice(&[0x11; 32]);
        data[V2_OFFSET_MESSAGE_METADATA_DIGEST..V2_OFFSET_MESSAGE_METADATA_DIGEST + 32]
            .copy_from_slice(&[0x22; 32]);
        data[V2_OFFSET_APPROVER..V2_OFFSET_APPROVER + 32].copy_from_slice(approver.as_ref());
        data[V2_OFFSET_USER_PUBKEY..V2_OFFSET_USER_PUBKEY + 32].copy_from_slice(user.as_ref());
        data[V2_OFFSET_SIGNATURE_SCHEME..V2_OFFSET_SIGNATURE_SCHEME + 2]
            .copy_from_slice(&5u16.to_le_bytes());
        data[V2_OFFSET_EPOCH..V2_OFFSET_EPOCH + 8].copy_from_slice(&42u64.to_le_bytes());
        data[V2_OFFSET_STATUS] = 1;
        data[V2_OFFSET_SIGNATURE_LEN..V2_OFFSET_SIGNATURE_LEN + 2]
            .copy_from_slice(&64u16.to_le_bytes());
        data[V2_OFFSET_SIGNATURE..V2_OFFSET_SIGNATURE + 64].copy_from_slice(&[0xAB; 64]);
        data[V2_OFFSET_BUMP] = 254;

        let parsed = parse_message_approval_account(&data).expect("layout should parse");

        assert_eq!(parsed.layout, DWalletMessageApprovalLayout::MetadataV2);
        assert_eq!(parsed.dwallet, dwallet);
        assert_eq!(parsed.approver, approver);
        assert_eq!(parsed.user_pubkey, user);
        assert_eq!(parsed.message_digest, [0x11; 32]);
        assert_eq!(parsed.message_metadata_digest, [0x22; 32]);
        assert_eq!(parsed.signature_scheme, SignatureScheme::EddsaSha512);
        assert_eq!(parsed.epoch, 42);
        assert_eq!(parsed.status, MessageApprovalStatus::Signed);
        assert_eq!(parsed.signature.len(), 64);
        assert_eq!(parsed.bump, 254);
    }

    #[test]
    fn parse_message_approval_layout_v1_is_still_supported() {
        let dwallet = Pubkey::new_unique();
        let approver = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        let mut data = vec![0u8; 220];
        data[0] = MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR;
        data[1] = MESSAGE_APPROVAL_ACCOUNT_VERSION;
        data[V1_OFFSET_DWALLET..V1_OFFSET_DWALLET + 32].copy_from_slice(dwallet.as_ref());
        data[V1_OFFSET_MESSAGE_DIGEST..V1_OFFSET_MESSAGE_DIGEST + 32].copy_from_slice(&[0x33; 32]);
        data[V1_OFFSET_APPROVER..V1_OFFSET_APPROVER + 32].copy_from_slice(approver.as_ref());
        data[V1_OFFSET_USER_PUBKEY..V1_OFFSET_USER_PUBKEY + 32].copy_from_slice(user.as_ref());
        data[V1_OFFSET_SIGNATURE_SCHEME] = 0;
        data[V1_OFFSET_EPOCH..V1_OFFSET_EPOCH + 8].copy_from_slice(&7u64.to_le_bytes());
        data[V1_OFFSET_STATUS] = 1;
        data[V1_OFFSET_SIGNATURE_LEN..V1_OFFSET_SIGNATURE_LEN + 2]
            .copy_from_slice(&64u16.to_le_bytes());
        data[V1_OFFSET_SIGNATURE..V1_OFFSET_SIGNATURE + 64].copy_from_slice(&[0xCD; 64]);

        let parsed = parse_message_approval_account(&data).expect("legacy layout should parse");

        assert_eq!(parsed.layout, DWalletMessageApprovalLayout::LegacyV1);
        assert_eq!(parsed.dwallet, dwallet);
        assert_eq!(parsed.message_digest, [0x33; 32]);
        assert_eq!(parsed.message_metadata_digest, [0u8; 32]);
        assert_eq!(parsed.signature_scheme, SignatureScheme::EcdsaKeccak256);
        assert_eq!(parsed.epoch, 7);
        assert_eq!(parsed.signature.len(), 64);
    }

    #[test]
    fn build_request_derives_legacy_message_approval_pda() {
        let pending = sample_pending();
        let dwallet_account = Pubkey::new_unique();
        let dwallet = DWalletReference {
            dwallet_id: "dw-1".to_string(),
            chain: aura_policy::Chain::Ethereum,
            address: "0xaura".to_string(),
            balance_usd: 1,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(dwallet_account.to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: None,
            public_key_hex: None,
            curve: crate::state::DWalletCurve::Secp256k1,
            signature_scheme: SignatureScheme::EcdsaKeccak256,
        };

        let built = build_message_approval_request(
            &pending,
            &dwallet,
            &Pubkey::new_unique(),
            DWalletMessageApprovalLayout::LegacyV1,
        )
        .expect("request should build");

        assert_eq!(built.layout, DWalletMessageApprovalLayout::LegacyV1);
        assert_eq!(
            built.message_digest_hex,
            hex::encode(keccak_message_digest(&built.message))
        );
        assert!(built.coordinator_account.is_none());
        assert!(built.approval_id.starts_with("msgappr_"));
    }

    #[test]
    fn build_request_derives_metadata_v2_message_approval_pda() {
        let pending = sample_pending();
        let dwallet_program = Pubkey::new_unique();
        let dwallet = DWalletReference {
            dwallet_id: "dw-2".to_string(),
            chain: aura_policy::Chain::Solana,
            address: Pubkey::new_unique().to_string(),
            balance_usd: 1,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(Pubkey::new_unique().to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: Some(hex::encode([0x55u8; 32])),
            public_key_hex: Some(hex::encode([0x44u8; 32])),
            curve: crate::state::DWalletCurve::Ed25519,
            signature_scheme: SignatureScheme::EddsaSha512,
        };

        let built = build_message_approval_request(
            &pending,
            &dwallet,
            &dwallet_program,
            DWalletMessageApprovalLayout::MetadataV2,
        )
        .expect("request should build");

        let (expected_coordinator, _) =
            Pubkey::find_program_address(&[DWALLET_COORDINATOR_SEED], &dwallet_program);
        assert_eq!(built.layout, DWalletMessageApprovalLayout::MetadataV2);
        assert_eq!(built.coordinator_account, Some(expected_coordinator));
        assert_eq!(built.message_metadata_digest_hex, hex::encode([0x55u8; 32]));
    }

    #[test]
    fn verify_message_approval_requires_matching_cpi_authority() {
        let approval_account = Pubkey::new_unique();
        let dwallet = Pubkey::new_unique();
        let approver = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        let request = PendingSignatureRequest {
            dwallet_account: dwallet.to_string(),
            message_approval_account: approval_account.to_string(),
            approval_id: "msgappr_test".to_string(),
            message_digest: hex::encode([0x11u8; 32]),
            message_metadata_digest: hex::encode([0u8; 32]),
            signature_scheme: SignatureScheme::EddsaSha512,
            requested_at: 7,
        };
        let approval = OnchainMessageApproval {
            layout: DWalletMessageApprovalLayout::MetadataV2,
            dwallet,
            message_digest: [0x11u8; 32],
            message_metadata_digest: [0u8; 32],
            approver,
            user_pubkey: user,
            signature_scheme: SignatureScheme::EddsaSha512,
            epoch: 9,
            status: MessageApprovalStatus::Signed,
            signature: vec![0xAB; 64],
            bump: 1,
        };

        verify_message_approval(&approval_account, &approval, &request, &approver, &user)
            .expect("matching CPI authority should verify");

        let err = verify_message_approval(
            &approval_account,
            &approval,
            &request,
            &Pubkey::new_unique(),
            &user,
        )
        .expect_err("mismatched CPI authority should fail");

        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }
}
