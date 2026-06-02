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
        DWalletCurve, DWalletReference, PendingSignatureRequest, PendingTransaction,
        SignatureScheme,
    },
    TreasuryError,
};

type TreasuryResult<T> = std::result::Result<T, TreasuryError>;

/// Seed used to derive the CPI authority PDA that signs on behalf of aura-core.
/// Must match the seed expected by the dWallet program's CPI authority check.
pub const DWALLET_CPI_AUTHORITY_SEED: &[u8] = b"__ika_cpi_authority";

/// Seed for the dWallet coordinator PDA, required by the dWallet approve-message
/// instruction as an additional read-only account.
pub const DWALLET_COORDINATOR_SEED: &[u8] = b"dwallet_coordinator";

/// Seed prefix used when deriving the dWallet PDA itself.
pub const DWALLET_SEED: &[u8] = b"dwallet";

/// Seed used to derive the `MessageApproval` PDA.
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

/// Fixed byte length of a fully-populated `MessageApproval` account
/// (128-byte ECDSA/EdDSA signature + all header fields).
pub const MESSAGE_APPROVAL_ACCOUNT_LEN: usize = 312;

// MessageApproval account field offsets.
//
// Layout (bytes):
//   [0]       discriminator
//   [1]       version
//   [2..34]   dwallet pubkey
//   [34..66]  message_digest
//   [66..98]  message_metadata_digest
//   [98..130] approver pubkey
//   [130..162] user_pubkey
//   [162..164] signature_scheme (u16 LE)
//   [164..172] epoch (u64 LE)
//   [172]     status (u8)
//   [173..175] signature_len (u16 LE)
//   [175..303] signature bytes (128 bytes max)
//   [303]     bump
const OFFSET_DWALLET: usize = 2;
const OFFSET_MESSAGE_DIGEST: usize = 34;
const OFFSET_MESSAGE_METADATA_DIGEST: usize = 66;
const OFFSET_APPROVER: usize = 98;
const OFFSET_USER_PUBKEY: usize = 130;
const OFFSET_SIGNATURE_SCHEME: usize = 162;
const OFFSET_EPOCH: usize = 164;
const OFFSET_STATUS: usize = 172;
const OFFSET_SIGNATURE_LEN: usize = 173;
const OFFSET_SIGNATURE: usize = 175;
const OFFSET_BUMP: usize = 303;

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
    /// The coordinator PDA required by the dWallet approve-message instruction.
    pub coordinator_account: Pubkey,
    /// Human-readable chain message string (used for digest derivation and audit).
    pub message: String,
    /// Keccak-256 digest of `message`, passed as instruction data.
    pub message_digest: [u8; 32],
    /// Hex-encoded form of `message_digest`, stored in `PendingSignatureRequest`.
    pub message_digest_hex: String,
    /// Metadata digest from `DWalletReference::message_metadata_digest`, or all-zeros
    /// when no metadata digest is configured.
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
/// Produced by `parse_message_approval_account` from the current dWallet
/// `MessageApproval` byte layout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OnchainMessageApproval {
    /// The dWallet account this approval belongs to.
    pub dwallet: Pubkey,
    /// Keccak-256 digest of the signed message.
    pub message_digest: [u8; 32],
    /// Metadata digest included in the PDA derivation.
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
    /// PDA bump stored by the dWallet program.
    pub bump: u8,
}

/// Derives all fields needed to call `approve_message` on the dWallet program.
///
/// Builds the chain message from `pending` and `dwallet`, computes its
/// Keccak-256 digest, resolves the metadata digest, and derives the canonical
/// `MessageApproval` PDA.
///
/// Returns a `MessageApprovalRequest` ready to be passed to
/// `approve_message_via_cpi` and stored as a `PendingSignatureRequest`.
pub fn build_message_approval_request(
    pending: &PendingTransaction,
    dwallet: &DWalletReference,
    dwallet_program_id: &Pubkey,
) -> TreasuryResult<MessageApprovalRequest> {
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

    let (message_approval_account, message_approval_bump) = find_message_approval_pda(
        dwallet,
        &message_digest,
        &message_metadata_digest,
        dwallet_program_id,
    )?;
    let (coordinator_account, _) =
        Pubkey::find_program_address(&[DWALLET_COORDINATOR_SEED], dwallet_program_id);

    Ok(MessageApprovalRequest {
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
/// Builds the current 7-account instruction, includes the message metadata
/// digest in instruction data, and calls `invoke_signed` with the CPI authority
/// PDA as the signer.
///
/// The dWallet network processes the approval asynchronously. Poll
/// `parse_message_approval_account` until `status == Signed` before calling
/// `finalize_execution`.
#[allow(clippy::too_many_arguments)]
pub fn approve_message_via_cpi<'info>(
    dwallet_program: &AccountInfo<'info>,
    coordinator: &AccountInfo<'info>,
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
    let mut data = Vec::with_capacity(100);
    data.push(IX_APPROVE_MESSAGE);
    data.push(approval_bump);
    data.extend_from_slice(&message_digest);
    data.extend_from_slice(&message_metadata_digest);
    data.extend_from_slice(&user_pubkey);
    data.extend_from_slice(&signature_scheme.dwallet_scheme_code().to_le_bytes());

    let accounts = vec![
        AccountMeta::new_readonly(coordinator.key(), false),
        AccountMeta::new(message_approval.key(), false),
        AccountMeta::new_readonly(dwallet.key(), false),
        AccountMeta::new_readonly(caller_program.key(), false),
        AccountMeta::new_readonly(cpi_authority.key(), true),
        AccountMeta::new(payer.key(), true),
        AccountMeta::new_readonly(system_program.key(), false),
    ];
    let account_infos = vec![
        coordinator.clone(),
        message_approval.clone(),
        dwallet.clone(),
        caller_program.clone(),
        cpi_authority.clone(),
        payer.clone(),
        system_program.clone(),
        dwallet_program.clone(),
    ];

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
/// Validates the discriminator and version bytes, then parses the current
/// `MessageApproval` byte layout. Legacy layouts are intentionally rejected.
///
/// Returns `TreasuryError::InvalidAccountData` if the account is malformed.
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

    parse_current_message_approval_account(data)
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

/// Derives the canonical `MessageApproval` PDA.
///
/// Seeds: `[DWALLET_SEED, <curve_code_le>, <public_key_chunks…>,
///          MESSAGE_APPROVAL_SEED, <scheme_le>, message_digest,
///          (message_metadata_digest if non-zero)]`
///
/// Requires `dwallet.public_key_hex` to be set; returns
/// `TreasuryError::InvalidAccountData` otherwise.
pub fn find_message_approval_pda(
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

/// Parses a `MessageApproval` account using the current byte layout.
///
/// Fails if the account is shorter than `MESSAGE_APPROVAL_ACCOUNT_LEN`.
fn parse_current_message_approval_account(data: &[u8]) -> TreasuryResult<OnchainMessageApproval> {
    if data.len() < MESSAGE_APPROVAL_ACCOUNT_LEN {
        return Err(TreasuryError::InvalidAccountData(format!(
            "message approval length {} is smaller than expected {}",
            data.len(),
            MESSAGE_APPROVAL_ACCOUNT_LEN
        )));
    }

    let signature_len = read_signature_len(data, OFFSET_SIGNATURE_LEN)?;
    let scheme_code = u16::from_le_bytes(
        data[OFFSET_SIGNATURE_SCHEME..OFFSET_SIGNATURE_SCHEME + 2]
            .try_into()
            .map_err(|_| TreasuryError::InvalidAccountData("missing scheme code".to_string()))?,
    );
    let signature_scheme = signature_scheme_from_code(scheme_code)?;
    let epoch = u64::from_le_bytes(
        data[OFFSET_EPOCH..OFFSET_EPOCH + 8]
            .try_into()
            .map_err(|_| TreasuryError::InvalidAccountData("missing epoch".to_string()))?,
    );

    Ok(OnchainMessageApproval {
        dwallet: read_pubkey(data, OFFSET_DWALLET)?,
        message_digest: read_digest(data, OFFSET_MESSAGE_DIGEST)?,
        message_metadata_digest: read_digest(data, OFFSET_MESSAGE_METADATA_DIGEST)?,
        approver: read_pubkey(data, OFFSET_APPROVER)?,
        user_pubkey: read_pubkey(data, OFFSET_USER_PUBKEY)?,
        signature_scheme,
        epoch,
        status: approval_status_from_byte(data[OFFSET_STATUS])?,
        signature: read_signature_bytes(data, OFFSET_SIGNATURE, signature_len)?,
        bump: data[OFFSET_BUMP],
    })
}

/// Maps a `DWalletCurve` variant to the 2-byte little-endian seed code used
/// in the message approval PDA derivation.
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
            transfer: crate::state::TransferDetails::default(),
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
                risk_score: 0,
                risk_factors: vec![],
                regulatory_flags: 0,
                next_state: Default::default(),
                trace: vec![],
            },
            risk_score: 0,
            required_approval_level: 0,
            satisfied_approval_level: 0,
            approvals: Vec::new(),
            earliest_execution_at: 0,
            requires_guardian_cosign: false,
            policy_version: 1,
            compliance_metadata: None,
        }
    }

    #[test]
    fn parse_message_approval_current_layout() {
        let dwallet = Pubkey::new_unique();
        let approver = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        let mut data = vec![0u8; MESSAGE_APPROVAL_ACCOUNT_LEN];
        data[0] = MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR;
        data[1] = MESSAGE_APPROVAL_ACCOUNT_VERSION;
        data[OFFSET_DWALLET..OFFSET_DWALLET + 32].copy_from_slice(dwallet.as_ref());
        data[OFFSET_MESSAGE_DIGEST..OFFSET_MESSAGE_DIGEST + 32].copy_from_slice(&[0x11; 32]);
        data[OFFSET_MESSAGE_METADATA_DIGEST..OFFSET_MESSAGE_METADATA_DIGEST + 32]
            .copy_from_slice(&[0x22; 32]);
        data[OFFSET_APPROVER..OFFSET_APPROVER + 32].copy_from_slice(approver.as_ref());
        data[OFFSET_USER_PUBKEY..OFFSET_USER_PUBKEY + 32].copy_from_slice(user.as_ref());
        data[OFFSET_SIGNATURE_SCHEME..OFFSET_SIGNATURE_SCHEME + 2]
            .copy_from_slice(&5u16.to_le_bytes());
        data[OFFSET_EPOCH..OFFSET_EPOCH + 8].copy_from_slice(&42u64.to_le_bytes());
        data[OFFSET_STATUS] = 1;
        data[OFFSET_SIGNATURE_LEN..OFFSET_SIGNATURE_LEN + 2].copy_from_slice(&64u16.to_le_bytes());
        data[OFFSET_SIGNATURE..OFFSET_SIGNATURE + 64].copy_from_slice(&[0xAB; 64]);
        data[OFFSET_BUMP] = 254;

        let parsed = parse_message_approval_account(&data).expect("layout should parse");

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
    fn parse_message_approval_rejects_legacy_sized_accounts() {
        let mut data = vec![0u8; 220];
        data[0] = MESSAGE_APPROVAL_ACCOUNT_DISCRIMINATOR;
        data[1] = MESSAGE_APPROVAL_ACCOUNT_VERSION;

        let err = parse_message_approval_account(&data)
            .expect_err("legacy-sized approval accounts must be rejected");

        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn build_request_requires_dwallet_public_key_hex() {
        let pending = sample_pending();
        let dwallet_account = Pubkey::new_unique();
        let dwallet = DWalletReference {
            dwallet_id: "dw-1".to_string(),
            chain: aura_policy::Chain::Ethereum,
            address: "0xaura".to_string(),
            balance_usd: 1,
            balance_updated_at: 0,
            balance_oracle: None,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(dwallet_account.to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: None,
            public_key_hex: None,
            curve: crate::state::DWalletCurve::Secp256k1,
            signature_scheme: SignatureScheme::EcdsaKeccak256,
        };

        let err = build_message_approval_request(&pending, &dwallet, &Pubkey::new_unique())
            .expect_err("canonical approval PDA derivation requires dWallet public key bytes");

        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn build_request_derives_message_approval_pda() {
        let pending = sample_pending();
        let dwallet_program = Pubkey::new_unique();
        let dwallet = DWalletReference {
            dwallet_id: "dw-2".to_string(),
            chain: aura_policy::Chain::Solana,
            address: Pubkey::new_unique().to_string(),
            balance_usd: 1,
            balance_updated_at: 0,
            balance_oracle: None,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(Pubkey::new_unique().to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: Some(hex::encode([0x55u8; 32])),
            public_key_hex: Some(hex::encode([0x44u8; 32])),
            curve: crate::state::DWalletCurve::Ed25519,
            signature_scheme: SignatureScheme::EddsaSha512,
        };

        let built = build_message_approval_request(&pending, &dwallet, &dwallet_program)
            .expect("request should build");

        let (expected_coordinator, _) =
            Pubkey::find_program_address(&[DWALLET_COORDINATOR_SEED], &dwallet_program);
        let (expected_approval, expected_bump) = find_message_approval_pda(
            &dwallet,
            &built.message_digest,
            &built.message_metadata_digest,
            &dwallet_program,
        )
        .expect("canonical pda should derive");

        assert_eq!(built.coordinator_account, expected_coordinator);
        assert_eq!(built.message_approval_account, expected_approval);
        assert_eq!(built.message_approval_bump, expected_bump);
        assert_eq!(built.message_metadata_digest_hex, hex::encode([0x55u8; 32]));
        assert_eq!(
            built.message_digest_hex,
            hex::encode(keccak_message_digest(&built.message))
        );
    }

    #[test]
    fn asset_aware_transfer_changes_signed_message() {
        let mut pending = sample_pending();
        let dwallet = DWalletReference {
            dwallet_id: "dw-2".to_string(),
            chain: aura_policy::Chain::Ethereum,
            address: "0xdwallet".to_string(),
            balance_usd: 1,
            balance_updated_at: 0,
            balance_oracle: None,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(Pubkey::new_unique().to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: Some(hex::encode([0x55u8; 32])),
            public_key_hex: Some(hex::encode([0x44u8; 32])),
            curve: crate::state::DWalletCurve::Secp256k1,
            signature_scheme: SignatureScheme::EcdsaKeccak256,
        };
        let legacy_message = build_chain_message(&pending, &dwallet);

        pending.transfer = crate::state::TransferDetails {
            asset_id: Some("usdc".to_string()),
            native_amount: Some(1_000_000),
            decimals: Some(6),
            gas_native_amount: Some(21_000),
            gas_asset_id: Some("eth".to_string()),
            execution_binding: Default::default(),
        };
        let asset_message = build_chain_message(&pending, &dwallet);

        assert_ne!(legacy_message, asset_message);
        assert!(asset_message.contains("asset=usdc"));
        assert!(asset_message.contains("gas_asset=eth"));
        assert_ne!(
            keccak_message_digest(&legacy_message),
            keccak_message_digest(&asset_message)
        );
    }

    #[test]
    fn chain_execution_binding_changes_signed_message() {
        let mut pending = sample_pending();
        let dwallet = DWalletReference {
            dwallet_id: "dw-2".to_string(),
            chain: aura_policy::Chain::Ethereum,
            address: "0xdwallet".to_string(),
            balance_usd: 1,
            balance_updated_at: 0,
            balance_oracle: None,
            authority: "authority".to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            dwallet_account: Some(Pubkey::new_unique().to_string()),
            authorized_user_pubkey: Some(Pubkey::new_unique().to_string()),
            message_metadata_digest: Some(hex::encode([0x55u8; 32])),
            public_key_hex: Some(hex::encode([0x44u8; 32])),
            curve: crate::state::DWalletCurve::Secp256k1,
            signature_scheme: SignatureScheme::EcdsaKeccak256,
        };
        let legacy_message = build_chain_message(&pending, &dwallet);

        pending.transfer.execution_binding = crate::state::ChainExecutionBinding {
            evm_chain_id: Some(1),
            replay_nonce: Some(7),
            gas_limit: Some(21_000),
            max_fee_native: Some(2_000_000_000),
            calldata_hash: Some([0xAB; 32]),
            confirmations_required: Some(12),
            ..Default::default()
        };
        let bound_message = build_chain_message(&pending, &dwallet);

        assert_ne!(legacy_message, bound_message);
        assert!(bound_message.contains("bind_evm_chain_id="));
        assert!(bound_message.contains("bind_nonce="));
        assert_ne!(
            keccak_message_digest(&legacy_message),
            keccak_message_digest(&bound_message)
        );
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
