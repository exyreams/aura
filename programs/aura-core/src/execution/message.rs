use sha2::{Digest, Sha256};
use sha3::Keccak256;

use aura_policy::{Chain, TransactionType};

use crate::state::{DWalletReference, PendingTransaction};

/// Builds the canonical chain message string that is signed by the dWallet network.
///
/// The message encodes all fields that uniquely identify a proposal and its
/// policy outcome, so any tampering with the transaction details or policy
/// result would produce a different digest and fail signature verification.
///
/// Format: `{proposal_id}:{proposal_digest}:{chain}:{tx_type}:{dwallet_address}:
///          {recipient_or_contract}:{amount_usd}:{policy_output_digest}`
pub fn build_chain_message(pending: &PendingTransaction, dwallet: &DWalletReference) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}:{}",
        pending.proposal_id,
        pending.proposal_digest,
        pending.target_chain,
        pending.tx_type,
        dwallet.address,
        pending.recipient_or_contract,
        pending.amount_usd,
        pending.policy_output_digest
    )
}

/// Returns the hex-encoded SHA-256 digest of `message`.
///
/// Used for proposal digests, policy output digests, and the `decision_digest`
/// binding in `encrypt.rs`. Prefer `keccak_message_digest` when the output
/// must be passed to the dWallet signing instruction.
pub fn hash_message(message: &str) -> String {
    hex::encode(Sha256::digest(message.as_bytes()))
}

/// Returns the raw 32-byte Keccak-256 digest of `message`.
///
/// This is the digest format expected by the dWallet `approve_message`
/// instruction for ECDSA and EdDSA signing.
pub fn keccak_message_digest(message: &str) -> [u8; 32] {
    Keccak256::digest(message.as_bytes()).into()
}

/// Returns the hex-encoded Keccak-256 digest of `message`.
pub fn keccak_message_digest_hex(message: &str) -> String {
    hex::encode(keccak_message_digest(message))
}

/// Produces a deterministic hex digest that uniquely identifies a proposal.
///
/// Hashes the combination of proposal ID, chain, transaction type, recipient,
/// amount, submission timestamp, and policy output digest. Stored on the
/// `PendingTransaction` and included in the chain message so that the dWallet
/// signature covers the full proposal identity.
pub fn generate_proposal_digest(
    proposal_id: u64,
    target_chain: Chain,
    tx_type: TransactionType,
    recipient_or_contract: &str,
    amount_usd: u64,
    submitted_at: i64,
    policy_output_digest: &str,
) -> String {
    hash_message(&format!(
        "{proposal_id}:{target_chain}:{tx_type}:{recipient_or_contract}:{amount_usd}:{submitted_at}:{policy_output_digest}"
    ))
}
