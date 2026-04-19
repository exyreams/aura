use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::invoke_signed,
    },
};
use aura_policy::PolicyDecision;
use encrypt_solana_types::cpi::EncryptCpi;
use sha2::Digest;

use crate::{execution::hash_message, TreasuryError};

type TreasuryResult<T> = std::result::Result<T, TreasuryError>;

/// Seed used to derive the CPI authority PDA that signs on behalf of aura-core
/// when calling the Encrypt program.
pub const ENCRYPT_CPI_AUTHORITY_SEED: &[u8] = b"__encrypt_cpi_authority";

/// Seed used to derive the event authority PDA required by the Encrypt program's
/// self-CPI event emission pattern.
pub const ENCRYPT_EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";

/// Instruction discriminator for `request_decryption` in the Encrypt program.
pub const IX_REQUEST_DECRYPTION: u8 = 11;
/// Instruction discriminator for `execute_graph` in the Encrypt program.
pub const IX_EXECUTE_GRAPH: u8 = 4;

/// FHE type code for a single encrypted `u64` scalar.
pub const ENCRYPT_FHE_UINT64: u8 = 4;

/// FHE type code for an encrypted vector of `u64` values (used for multi-lane
/// policy outputs such as swarm shared-pool limits).
pub const ENCRYPT_FHE_VECTOR_U64: u8 = 35;

/// Version byte expected in all Encrypt program accounts.
pub const ENCRYPT_ACCOUNT_VERSION: u8 = 1;

/// Discriminator byte identifying a `Ciphertext` account.
pub const CIPHERTEXT_ACCOUNT_DISCRIMINATOR: u8 = 6;

/// Discriminator byte identifying a `DecryptionRequest` account.
pub const DECRYPTION_REQUEST_ACCOUNT_DISCRIMINATOR: u8 = 3;

// Ciphertext account field offsets
//
// Layout (bytes):
//   [0]       discriminator
//   [1]       version
//   [2..98]   ciphertext_digest (96 bytes — SHA-384 of the FHE ciphertext)
//   [98]      fhe_type
//   [99]      status
const ACCOUNT_DISCRIMINATOR: usize = 0;
const ACCOUNT_VERSION: usize = 1;
const CT_CIPHERTEXT_DIGEST: usize = 2;
const CT_FHE_TYPE: usize = 98;
const CT_STATUS: usize = 99;
const CT_LEN: usize = 100;

// DecryptionRequest account field offsets
//
// Layout (bytes):
//   [0]       discriminator
//   [1]       version
//   [2..34]   ciphertext pubkey
//   [34..66]  ciphertext_digest
//   [66..98]  requester pubkey
//   [98]      fhe_type
//   [99..103] total_len (u32 LE) — expected plaintext byte count
//   [103..107] bytes_written (u32 LE) — plaintext bytes written so far
//   [107+]    plaintext bytes (present only when bytes_written == total_len)
const DR_CIPHERTEXT: usize = 2;
const DR_CIPHERTEXT_DIGEST: usize = 34;
const DR_REQUESTER: usize = 66;
const DR_FHE_TYPE: usize = 98;
const DR_TOTAL_LEN: usize = 99;
const DR_BYTES_WRITTEN: usize = 103;
const DR_HEADER_END: usize = 107;

/// The result of a successful FHE graph evaluation via the Encrypt program.
///
/// Produced off-chain after the graph executes and the output ciphertext is
/// written. Stored alongside the `PendingTransaction` so that
/// `confirm_policy_decryption` can verify the decrypted value matches.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncryptEvaluation {
    /// Name of the FHE policy graph that was evaluated.
    pub graph_name: String,
    /// Hex-encoded SHA-256 digest of the output ciphertext, used for tamper detection.
    pub output_digest: String,
    /// The policy decision encoded inside the output ciphertext.
    pub decision: PolicyDecision,
}

/// Account references and CPI authority bump needed to call the Encrypt program.
///
/// Implements `EncryptCpi` from `encrypt_solana_types` so that the
/// `encrypt-solana-dsl` graph execution helpers can drive the CPI without
/// knowing about Anchor account types.
pub struct AuraEncryptContext<'info> {
    pub encrypt_program: AccountInfo<'info>,
    pub config: AccountInfo<'info>,
    pub deposit: AccountInfo<'info>,
    pub cpi_authority: AccountInfo<'info>,
    pub caller_program: AccountInfo<'info>,
    pub network_encryption_key: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    /// Bump seed for the `ENCRYPT_CPI_AUTHORITY_SEED` PDA.
    pub cpi_authority_bump: u8,
}

impl<'info> EncryptCpi for AuraEncryptContext<'info> {
    type Error = anchor_lang::error::Error;
    type Account<'a>
        = AccountInfo<'info>
    where
        Self: 'a;

    fn invoke_execute_graph<'a>(
        &'a self,
        ix_data: &[u8],
        encrypt_execute_accounts: &[Self::Account<'a>],
    ) -> std::result::Result<(), Self::Error> {
        let num_inputs = parse_execute_graph_num_inputs(ix_data).ok_or_else(|| {
            anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::ConstraintRaw)
        })?;
        let mut accounts = vec![
            AccountMeta::new_readonly(self.config.key(), false),
            AccountMeta::new(self.deposit.key(), false),
            AccountMeta::new_readonly(self.caller_program.key(), false),
            AccountMeta::new_readonly(self.cpi_authority.key(), true),
            AccountMeta::new_readonly(self.network_encryption_key.key(), false),
            AccountMeta::new(self.payer.key(), true),
            AccountMeta::new_readonly(self.event_authority.key(), false),
            AccountMeta::new_readonly(self.encrypt_program.key(), false),
        ];
        for (index, account) in encrypt_execute_accounts.iter().enumerate() {
            let is_signer = account.is_signer;
            let meta = if index < num_inputs {
                AccountMeta::new_readonly(account.key(), is_signer)
            } else {
                AccountMeta::new(account.key(), is_signer)
            };
            accounts.push(meta);
        }
        accounts.push(AccountMeta::new_readonly(self.system_program.key(), false));

        let ix = Instruction {
            program_id: self.encrypt_program.key(),
            accounts,
            data: ix_data.to_vec(),
        };

        let mut account_infos = vec![
            self.config.clone(),
            self.deposit.clone(),
            self.caller_program.clone(),
            self.cpi_authority.clone(),
            self.network_encryption_key.clone(),
            self.payer.clone(),
            self.event_authority.clone(),
            self.encrypt_program.clone(),
        ];
        account_infos.extend_from_slice(encrypt_execute_accounts);
        account_infos.push(self.system_program.clone());

        let seeds = &[ENCRYPT_CPI_AUTHORITY_SEED, &[self.cpi_authority_bump]];
        let signer_seeds = &[&seeds[..]];
        invoke_signed(&ix, &account_infos, signer_seeds)?;
        Ok(())
    }

    fn read_fhe_type<'a>(&'a self, account: Self::Account<'a>) -> Option<u8> {
        let data = account.try_borrow_data().ok()?;
        if data.len() < CT_LEN {
            return None;
        }
        Some(data[CT_FHE_TYPE])
    }

    fn type_mismatch_error(&self) -> Self::Error {
        anchor_lang::error::Error::from(anchor_lang::error::ErrorCode::ConstraintRaw)
    }
}

/// Whether the Encrypt network has written plaintext bytes to a decryption request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecryptionStatus {
    /// No plaintext bytes have been written yet.
    Pending,
    /// Some bytes have been written but the full plaintext is not yet available.
    InProgress,
    /// All expected bytes have been written; plaintext is ready to read.
    Ready,
}

/// Parsed representation of a `Ciphertext` account from the Encrypt program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OnchainCiphertext {
    /// SHA-384 digest of the raw FHE ciphertext bytes, used for tamper detection.
    pub digest: [u8; 32],
    /// FHE type code (e.g. `ENCRYPT_FHE_UINT64` or `ENCRYPT_FHE_VECTOR_U64`).
    pub fhe_type: u8,
    /// Raw status byte from the account (interpretation is Encrypt-program-internal).
    pub status: u8,
}

/// Parsed representation of a `DecryptionRequest` account from the Encrypt program.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OnchainDecryptionRequest {
    /// The `Ciphertext` account this request targets.
    pub ciphertext: Pubkey,
    /// Digest of the ciphertext at the time the request was submitted.
    pub ciphertext_digest: [u8; 32],
    /// The account that submitted the decryption request.
    pub requester: Pubkey,
    /// FHE type code of the ciphertext being decrypted.
    pub fhe_type: u8,
    /// Total number of plaintext bytes expected once decryption completes.
    pub total_len: u32,
    /// Number of plaintext bytes written so far by the Encrypt network.
    pub bytes_written: u32,
    /// Plaintext bytes; `Some` only when `bytes_written == total_len`.
    pub plaintext: Option<Vec<u8>>,
}

impl OnchainDecryptionRequest {
    /// Derives the current decryption status from `bytes_written` and `total_len`.
    pub fn status(&self) -> DecryptionStatus {
        match (self.bytes_written, self.total_len) {
            (0, _) => DecryptionStatus::Pending,
            (written, total) if written < total => DecryptionStatus::InProgress,
            _ => DecryptionStatus::Ready,
        }
    }

    /// Returns the hex-encoded SHA-256 digest of the plaintext bytes, or `None`
    /// if decryption is not yet complete.
    pub fn plaintext_sha256(&self) -> Option<String> {
        self.plaintext
            .as_deref()
            .map(|bytes| hex::encode(sha2::Sha256::digest(bytes)))
    }
}

/// Produces a deterministic hex digest of a `PolicyDecision`.
///
/// Encodes the approval flag, violation code, effective daily limit, next
/// policy state counters, and the full rule trace into a single string, then
/// hashes it with `hash_message`. Used to bind the off-chain decision to the
/// on-chain ciphertext so that `confirm_policy_decryption` can detect tampering.
pub fn decision_digest(decision: &PolicyDecision) -> String {
    let trace = decision
        .trace
        .iter()
        .map(|outcome| {
            format!(
                "{}:{}:{}",
                outcome.rule_name, outcome.passed, outcome.detail
            )
        })
        .collect::<Vec<_>>()
        .join("|");

    let state = format!(
        "{}:{}:{}:{}:{:?}",
        decision.next_state.spent_today_usd,
        decision.next_state.last_reset_timestamp,
        decision.next_state.hourly_spent_usd,
        decision.next_state.hourly_bucket_started_at,
        decision.next_state.recent_amounts
    );

    hash_message(&format!(
        "{}:{}:{}:{}:{}",
        decision.approved, decision.violation, decision.effective_daily_limit_usd, state, trace
    ))
}

/// Parses a raw `Ciphertext` account from the Encrypt program.
///
/// Validates the discriminator and version header, then reads the digest,
/// FHE type, and status fields. Returns `TreasuryError::InvalidAccountData`
/// if the account is too short or the header is invalid.
pub fn parse_ciphertext_account(data: &[u8]) -> TreasuryResult<OnchainCiphertext> {
    if data.len() < CT_LEN {
        return Err(TreasuryError::InvalidAccountData(format!(
            "ciphertext length {} is smaller than expected {}",
            data.len(),
            CT_LEN
        )));
    }
    validate_encrypt_account_header(data, CIPHERTEXT_ACCOUNT_DISCRIMINATOR, "ciphertext")?;

    Ok(OnchainCiphertext {
        digest: data[CT_CIPHERTEXT_DIGEST..CT_CIPHERTEXT_DIGEST + 32]
            .try_into()
            .map_err(|_| {
                TreasuryError::InvalidAccountData(
                    "ciphertext digest is missing from ciphertext account".to_string(),
                )
            })?,
        fhe_type: data[CT_FHE_TYPE],
        status: data[CT_STATUS],
    })
}

/// Parses a raw `DecryptionRequest` account from the Encrypt program.
///
/// Validates the header, reads the ciphertext reference, digest, requester,
/// FHE type, and progress counters. If `bytes_written == total_len > 0`, the
/// plaintext bytes are also read from the account tail.
///
/// Returns `TreasuryError::InvalidAccountData` for any structural violation.
pub fn parse_decryption_request_account(data: &[u8]) -> TreasuryResult<OnchainDecryptionRequest> {
    if data.len() < DR_HEADER_END {
        return Err(TreasuryError::InvalidAccountData(format!(
            "decryption request length {} is smaller than expected header {}",
            data.len(),
            DR_HEADER_END
        )));
    }
    validate_encrypt_account_header(
        data,
        DECRYPTION_REQUEST_ACCOUNT_DISCRIMINATOR,
        "decryption request",
    )?;

    let total_len = u32::from_le_bytes(data[DR_TOTAL_LEN..DR_TOTAL_LEN + 4].try_into().map_err(
        |_| TreasuryError::InvalidAccountData("missing decryption total_len".to_string()),
    )?);
    let bytes_written = u32::from_le_bytes(
        data[DR_BYTES_WRITTEN..DR_BYTES_WRITTEN + 4]
            .try_into()
            .map_err(|_| {
                TreasuryError::InvalidAccountData("missing decryption bytes_written".to_string())
            })?,
    );
    if bytes_written > total_len {
        return Err(TreasuryError::InvalidAccountData(format!(
            "decryption bytes_written {} exceeds total_len {}",
            bytes_written, total_len
        )));
    }

    let plaintext = if bytes_written == total_len && total_len > 0 {
        let end = DR_HEADER_END + total_len as usize;
        if data.len() < end {
            return Err(TreasuryError::InvalidAccountData(format!(
                "decryption request data {} is smaller than ready payload {}",
                data.len(),
                end
            )));
        }
        Some(data[DR_HEADER_END..end].to_vec())
    } else {
        None
    };

    Ok(OnchainDecryptionRequest {
        ciphertext: read_pubkey(data, DR_CIPHERTEXT)?,
        ciphertext_digest: data[DR_CIPHERTEXT_DIGEST..DR_CIPHERTEXT_DIGEST + 32]
            .try_into()
            .map_err(|_| {
                TreasuryError::InvalidAccountData(
                    "missing ciphertext digest in decryption request".to_string(),
                )
            })?,
        requester: read_pubkey(data, DR_REQUESTER)?,
        fhe_type: data[DR_FHE_TYPE],
        total_len,
        bytes_written,
        plaintext,
    })
}

/// Submits a `request_decryption` CPI to the Encrypt program.
///
/// Reads the ciphertext digest from the `ciphertext` account, builds the
/// instruction, and calls `invoke_signed` with the Encrypt CPI authority PDA
/// as the signer. Returns the ciphertext digest so the caller can store it
/// in the `PendingTransaction` for later verification.
pub fn request_decryption_via_cpi<'info>(
    encrypt_program: &AccountInfo<'info>,
    config: &AccountInfo<'info>,
    deposit: &AccountInfo<'info>,
    request_account: &AccountInfo<'info>,
    caller_program: &AccountInfo<'info>,
    cpi_authority: &AccountInfo<'info>,
    ciphertext: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    event_authority: &AccountInfo<'info>,
    cpi_authority_bump: u8,
) -> Result<[u8; 32]> {
    let ciphertext_data = ciphertext.try_borrow_data()?;
    let digest = parse_ciphertext_account(&ciphertext_data)
        .map_err(crate::map_treasury_error)?
        .digest;
    drop(ciphertext_data);

    let ix = Instruction {
        program_id: encrypt_program.key(),
        accounts: vec![
            AccountMeta::new_readonly(config.key(), false),
            AccountMeta::new(deposit.key(), false),
            AccountMeta::new(request_account.key(), request_account.is_signer),
            AccountMeta::new_readonly(caller_program.key(), false),
            AccountMeta::new_readonly(cpi_authority.key(), true),
            AccountMeta::new_readonly(ciphertext.key(), false),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(system_program.key(), false),
            AccountMeta::new_readonly(event_authority.key(), false),
            AccountMeta::new_readonly(encrypt_program.key(), false),
        ],
        data: vec![IX_REQUEST_DECRYPTION],
    };

    let account_infos = vec![
        config.clone(),
        deposit.clone(),
        request_account.clone(),
        caller_program.clone(),
        cpi_authority.clone(),
        ciphertext.clone(),
        payer.clone(),
        system_program.clone(),
        event_authority.clone(),
        encrypt_program.clone(),
    ];
    let seeds = &[ENCRYPT_CPI_AUTHORITY_SEED, &[cpi_authority_bump]];
    let signer_seeds = &[&seeds[..]];
    invoke_signed(&ix, &account_infos, signer_seeds)?;

    Ok(digest)
}

fn parse_execute_graph_num_inputs(ix_data: &[u8]) -> Option<usize> {
    if ix_data.len() < 4 || ix_data.first().copied()? != IX_EXECUTE_GRAPH {
        return None;
    }

    let graph_len = u16::from_le_bytes([ix_data[1], ix_data[2]]) as usize;
    if ix_data.len() != graph_len + 4 {
        return None;
    }

    ix_data.last().copied().map(usize::from)
}

/// Returns `true` if the decryption request's stored ciphertext digest matches
/// the expected digest. Used by `confirm_policy_decryption` to guard against
/// a substituted ciphertext account.
pub fn verify_decryption_request_digest(
    request: &OnchainDecryptionRequest,
    expected_digest: &[u8; 32],
) -> bool {
    &request.ciphertext_digest == expected_digest
}

/// Reads the decrypted `u64` value from lane 0 of a completed decryption request.
///
/// Convenience wrapper around `decrypt_u64_lane(request, 0)`.
pub fn decrypt_u64(request: &OnchainDecryptionRequest) -> TreasuryResult<u64> {
    decrypt_u64_lane(request, 0)
}

/// Reads a decrypted scalar integer value and widens it to `u64`.
///
/// Supports the scalar policy-output types produced by Encrypt graphs:
/// `EBool`, `EUint8`, `EUint16`, `EUint32`, and `EUint64`.
pub fn decrypt_scalar_u64(request: &OnchainDecryptionRequest) -> TreasuryResult<u64> {
    let plaintext = request.plaintext.as_deref().ok_or_else(|| {
        TreasuryError::InvalidAccountData(
            "decryption request does not contain completed plaintext bytes".to_string(),
        )
    })?;

    match request.fhe_type {
        0 | 1 => plaintext.first().copied().map(u64::from).ok_or_else(|| {
            TreasuryError::InvalidAccountData(
                "decrypted plaintext is shorter than one byte".to_string(),
            )
        }),
        2 => {
            let bytes: [u8; 2] = plaintext
                .get(..2)
                .ok_or_else(|| {
                    TreasuryError::InvalidAccountData(
                        "decrypted plaintext is shorter than two bytes".to_string(),
                    )
                })?
                .try_into()
                .map_err(|_| {
                    TreasuryError::InvalidAccountData(
                        "decrypted plaintext could not be parsed as u16".to_string(),
                    )
                })?;
            Ok(u16::from_le_bytes(bytes).into())
        }
        3 => {
            let bytes: [u8; 4] = plaintext
                .get(..4)
                .ok_or_else(|| {
                    TreasuryError::InvalidAccountData(
                        "decrypted plaintext is shorter than four bytes".to_string(),
                    )
                })?
                .try_into()
                .map_err(|_| {
                    TreasuryError::InvalidAccountData(
                        "decrypted plaintext could not be parsed as u32".to_string(),
                    )
                })?;
            Ok(u32::from_le_bytes(bytes).into())
        }
        ENCRYPT_FHE_UINT64 => decrypt_u64(request),
        other => Err(TreasuryError::InvalidAccountData(format!(
            "unsupported scalar FHE type {other} for policy output"
        ))),
    }
}

/// Returns `true` if `fhe_type` is a supported scalar policy-output type.
pub fn is_supported_policy_scalar_fhe_type(fhe_type: u8) -> bool {
    matches!(fhe_type, 0..=4)
}

/// Reads the decrypted `u64` value from a specific lane of a completed decryption request.
///
/// Each lane occupies 8 bytes in the plaintext. Lane 0 is the primary policy
/// output; higher lanes are used for vector FHE types (e.g. swarm shared-pool
/// limits). Returns `TreasuryError::InvalidAccountData` if the plaintext is
/// absent or too short for the requested lane.
pub fn decrypt_u64_lane(
    request: &OnchainDecryptionRequest,
    lane_index: usize,
) -> TreasuryResult<u64> {
    let plaintext = request.plaintext.as_deref().ok_or_else(|| {
        TreasuryError::InvalidAccountData(
            "decryption request does not contain completed plaintext bytes".to_string(),
        )
    })?;
    let start = lane_index
        .checked_mul(8)
        .ok_or_else(|| TreasuryError::InvalidAccountData("lane offset overflow".to_string()))?;
    let end = start + 8;
    let bytes: [u8; 8] = plaintext
        .get(start..end)
        .ok_or_else(|| {
            TreasuryError::InvalidAccountData(format!(
                "decrypted plaintext is shorter than lane {lane_index}"
            ))
        })?
        .try_into()
        .map_err(|_| {
            TreasuryError::InvalidAccountData(format!(
                "decrypted plaintext lane {lane_index} could not be parsed as u64"
            ))
        })?;
    Ok(u64::from_le_bytes(bytes))
}

/// Reads a 32-byte public key from `data` at `offset` and wraps it in a `Pubkey`.
fn read_pubkey(data: &[u8], offset: usize) -> TreasuryResult<Pubkey> {
    let bytes: [u8; 32] = data[offset..offset + 32]
        .try_into()
        .map_err(|_| TreasuryError::InvalidAccountData(format!("missing pubkey at {offset}")))?;
    Ok(Pubkey::new_from_array(bytes))
}

/// Validates the discriminator and version bytes at the start of an Encrypt
/// program account. Returns `TreasuryError::InvalidAccountData` if either
/// byte does not match the expected value.
fn validate_encrypt_account_header(
    data: &[u8],
    expected_discriminator: u8,
    account_name: &str,
) -> TreasuryResult<()> {
    let discriminator = data[ACCOUNT_DISCRIMINATOR];
    if discriminator != expected_discriminator {
        return Err(TreasuryError::InvalidAccountData(format!(
            "{account_name} discriminator {} does not match expected {}",
            discriminator, expected_discriminator
        )));
    }

    let version = data[ACCOUNT_VERSION];
    if version != ENCRYPT_ACCOUNT_VERSION {
        return Err(TreasuryError::InvalidAccountData(format!(
            "{account_name} version {} does not match expected {}",
            version, ENCRYPT_ACCOUNT_VERSION
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_ciphertext_data() -> Vec<u8> {
        let mut data = vec![0u8; CT_LEN];
        data[ACCOUNT_DISCRIMINATOR] = CIPHERTEXT_ACCOUNT_DISCRIMINATOR;
        data[ACCOUNT_VERSION] = ENCRYPT_ACCOUNT_VERSION;
        data[CT_CIPHERTEXT_DIGEST..CT_CIPHERTEXT_DIGEST + 32].copy_from_slice(&[0x55; 32]);
        data[CT_FHE_TYPE] = 7;
        data[CT_STATUS] = 1;
        data
    }

    fn sample_decryption_request_data() -> (Vec<u8>, Pubkey, Pubkey) {
        let ciphertext = Pubkey::new_unique();
        let requester = Pubkey::new_unique();
        let mut data = vec![0u8; DR_HEADER_END + 8];
        data[ACCOUNT_DISCRIMINATOR] = DECRYPTION_REQUEST_ACCOUNT_DISCRIMINATOR;
        data[ACCOUNT_VERSION] = ENCRYPT_ACCOUNT_VERSION;
        data[DR_CIPHERTEXT..DR_CIPHERTEXT + 32].copy_from_slice(ciphertext.as_ref());
        data[DR_CIPHERTEXT_DIGEST..DR_CIPHERTEXT_DIGEST + 32].copy_from_slice(&[0x44; 32]);
        data[DR_REQUESTER..DR_REQUESTER + 32].copy_from_slice(requester.as_ref());
        data[DR_FHE_TYPE] = 3;
        data[DR_TOTAL_LEN..DR_TOTAL_LEN + 4].copy_from_slice(&8u32.to_le_bytes());
        data[DR_BYTES_WRITTEN..DR_BYTES_WRITTEN + 4].copy_from_slice(&8u32.to_le_bytes());
        data[DR_HEADER_END..DR_HEADER_END + 8].copy_from_slice(&42u64.to_le_bytes());
        (data, ciphertext, requester)
    }

    #[test]
    fn parse_ciphertext_layout_matches_docs() {
        let parsed =
            parse_ciphertext_account(&sample_ciphertext_data()).expect("layout should parse");

        assert_eq!(parsed.digest, [0x55; 32]);
        assert_eq!(parsed.fhe_type, 7);
        assert_eq!(parsed.status, 1);
    }

    #[test]
    fn parse_ciphertext_rejects_wrong_discriminator() {
        let mut data = sample_ciphertext_data();
        data[ACCOUNT_DISCRIMINATOR] = 2;

        let err = parse_ciphertext_account(&data).expect_err("discriminator should be rejected");
        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn parse_ciphertext_rejects_wrong_version() {
        let mut data = sample_ciphertext_data();
        data[ACCOUNT_VERSION] = 2;

        let err = parse_ciphertext_account(&data).expect_err("version should be rejected");
        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn parse_decryption_request_layout_matches_docs() {
        let (data, ciphertext, requester) = sample_decryption_request_data();

        let parsed = parse_decryption_request_account(&data).expect("layout should parse");

        assert_eq!(parsed.ciphertext, ciphertext);
        assert_eq!(parsed.requester, requester);
        assert_eq!(parsed.ciphertext_digest, [0x44; 32]);
        assert_eq!(parsed.fhe_type, 3);
        assert_eq!(parsed.status(), DecryptionStatus::Ready);
        assert_eq!(
            parsed.plaintext.as_deref(),
            Some(42u64.to_le_bytes().as_slice())
        );
    }

    #[test]
    fn parse_decryption_request_rejects_wrong_discriminator() {
        let (mut data, _, _) = sample_decryption_request_data();
        data[ACCOUNT_DISCRIMINATOR] = 4;

        let err =
            parse_decryption_request_account(&data).expect_err("discriminator should be rejected");
        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn parse_decryption_request_rejects_wrong_version() {
        let (mut data, _, _) = sample_decryption_request_data();
        data[ACCOUNT_VERSION] = 9;

        let err = parse_decryption_request_account(&data).expect_err("version should be rejected");
        assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
    }

    #[test]
    fn decrypt_u64_lane_reads_requested_offset() {
        let (mut data, _, _) = sample_decryption_request_data();
        data.resize(DR_HEADER_END + 16, 0);
        data[DR_TOTAL_LEN..DR_TOTAL_LEN + 4].copy_from_slice(&16u32.to_le_bytes());
        data[DR_BYTES_WRITTEN..DR_BYTES_WRITTEN + 4].copy_from_slice(&16u32.to_le_bytes());
        data[DR_HEADER_END..DR_HEADER_END + 8].copy_from_slice(&42u64.to_le_bytes());
        data[DR_HEADER_END + 8..DR_HEADER_END + 16].copy_from_slice(&99u64.to_le_bytes());

        let parsed = parse_decryption_request_account(&data).expect("layout should parse");

        assert_eq!(decrypt_u64(&parsed).expect("lane 0"), 42);
        assert_eq!(decrypt_u64_lane(&parsed, 1).expect("lane 1"), 99);
    }

    #[test]
    fn parse_execute_graph_num_inputs_reads_trailing_byte() {
        let ix_data = vec![IX_EXECUTE_GRAPH, 3, 0, 9, 8, 7, 4];

        assert_eq!(parse_execute_graph_num_inputs(&ix_data), Some(4));
    }

    #[test]
    fn parse_execute_graph_num_inputs_rejects_malformed_payload() {
        let wrong_disc = vec![99, 0, 0, 0];
        let wrong_len = vec![IX_EXECUTE_GRAPH, 5, 0, 1, 2, 3];

        assert_eq!(parse_execute_graph_num_inputs(&wrong_disc), None);
        assert_eq!(parse_execute_graph_num_inputs(&wrong_len), None);
    }

    #[test]
    fn decrypt_scalar_u64_supports_narrow_scalar_types() {
        let (mut data, _, _) = sample_decryption_request_data();
        data.resize(DR_HEADER_END + 4, 0);
        data[DR_TOTAL_LEN..DR_TOTAL_LEN + 4].copy_from_slice(&4u32.to_le_bytes());
        data[DR_BYTES_WRITTEN..DR_BYTES_WRITTEN + 4].copy_from_slice(&4u32.to_le_bytes());
        data[DR_FHE_TYPE] = 3;
        data[DR_HEADER_END..DR_HEADER_END + 4].copy_from_slice(&7u32.to_le_bytes());

        let parsed = parse_decryption_request_account(&data).expect("layout should parse");

        assert_eq!(decrypt_scalar_u64(&parsed).expect("scalar u32"), 7);
        assert!(is_supported_policy_scalar_fhe_type(parsed.fhe_type));
    }
}
