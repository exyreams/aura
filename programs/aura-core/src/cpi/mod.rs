/// Thin adapter layer for cross-program invocations (CPI) to external Ika services.
///
/// All calls to the dWallet signing program and the Encrypt FHE evaluation
/// program are routed through this module. Instruction handlers in
/// `aura-core` must never reference external program account structures
/// directly — they go through the helpers here so that upstream API changes
/// only require edits in one place.
///
/// The two sub-modules are:
/// - `dwallet`  — message approval requests, PDA derivation, account parsing,
///                and ownership-transfer CPIs for Ika dWallet
/// - `encrypt`  — FHE graph execution, decryption requests, and ciphertext /
///                decryption-request account parsing for Ika Encrypt
mod dwallet;
mod encrypt;

pub use dwallet::{
    approve_message_via_cpi, build_message_approval_request, decode_digest_hex,
    parse_message_approval_account, parse_runtime_pubkey, pending_signature_request_from_live,
    transfer_dwallet_via_cpi, transfer_future_sign_via_cpi, verify_message_approval,
    zero_message_metadata_digest_hex, MessageApprovalRequest, MessageApprovalStatus,
    OnchainMessageApproval, DWALLET_COORDINATOR_SEED, DWALLET_CPI_AUTHORITY_SEED,
    MESSAGE_APPROVAL_SEED,
};

pub use encrypt::{
    decision_digest, decrypt_u64, decrypt_u64_lane, parse_ciphertext_account,
    parse_decryption_request_account, request_decryption_via_cpi, verify_decryption_request_digest,
    AuraEncryptContext, DecryptionStatus, EncryptEvaluation, OnchainCiphertext,
    OnchainDecryptionRequest, ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    ENCRYPT_FHE_UINT64, ENCRYPT_FHE_VECTOR_U64,
};
