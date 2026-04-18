/// Transaction lifecycle logic for the treasury.
///
/// This module owns the state-machine transitions that move a proposal from
/// submission through policy evaluation, optional FHE decryption, dWallet
/// signing, and final execution. All functions operate on `AgentTreasury`
/// directly and are called by the Anchor instruction handlers in
/// `instructions/`.
///
/// The two sub-modules are:
/// - `executor` — proposal creation, status transitions, and receipt generation
/// - `message`  — deterministic message and digest construction used for
///                signing and tamper detection
mod executor;
mod message;

pub use executor::{
    apply_confidential_policy_result, confirm_pending_decryption, deny_pending_transaction,
    evaluate_batch_preview, expire_pending_transaction, finalize_signed_pending,
    mark_pending_decryption_request, mark_signature_requested, propose_confidential_transaction,
    propose_confidential_vector_transaction, propose_transaction,
};
pub use message::{
    build_chain_message, generate_proposal_digest, hash_message, keccak_message_digest,
    keccak_message_digest_hex,
};
