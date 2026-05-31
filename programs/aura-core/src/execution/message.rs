use sha2::{Digest, Sha256};
use sha3::Keccak256;
use std::fmt::{self, Write};

use aura_policy::{Chain, TransactionType};

use crate::state::{DWalletReference, PendingTransaction, TransferDetails};

struct Sha256Writer(Sha256);

impl Sha256Writer {
    fn new() -> Self {
        Self(Sha256::new())
    }

    fn finish_hex(self) -> String {
        hex::encode(self.0.finalize())
    }
}

impl Write for Sha256Writer {
    fn write_str(&mut self, value: &str) -> fmt::Result {
        self.0.update(value.as_bytes());
        Ok(())
    }
}

/// Builds the canonical chain message string that is signed by the dWallet network.
///
/// The message encodes all fields that uniquely identify a proposal and its
/// policy outcome, so any tampering with the transaction details or policy
/// result would produce a different digest and fail signature verification.
///
/// Legacy format: `{proposal_id}:{proposal_digest}:{chain}:{tx_type}:{dwallet_address}:
///                 {recipient_or_contract}:{amount_usd}:{policy_output_digest}`.
/// Asset-aware proposals append the concrete transfer payload after that base.
pub fn build_chain_message(pending: &PendingTransaction, dwallet: &DWalletReference) -> String {
    let base = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}",
        pending.proposal_id,
        pending.proposal_digest,
        pending.target_chain,
        pending.tx_type,
        dwallet.address,
        pending.recipient_or_contract,
        pending.amount_usd,
        pending.policy_output_digest
    );
    append_transfer_details(base, &pending.transfer)
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
    transfer: &TransferDetails,
) -> String {
    let mut writer = Sha256Writer::new();
    write!(
        writer,
        "{proposal_id}:{target_chain}:{tx_type}:{recipient_or_contract}:{amount_usd}:{submitted_at}:{policy_output_digest}"
    )
    .expect("writing to sha256 cannot fail");
    write_transfer_details(&mut writer, transfer).expect("writing to sha256 cannot fail");
    writer.finish_hex()
}

fn append_transfer_details(base: String, transfer: &TransferDetails) -> String {
    if transfer.is_legacy() {
        return base;
    }

    let mut message = base;
    write_transfer_details(&mut message, transfer).expect("writing to string cannot fail");
    message
}

fn write_transfer_details<W: Write>(writer: &mut W, transfer: &TransferDetails) -> fmt::Result {
    if transfer.is_legacy() {
        return Ok(());
    }

    writer.write_str(":asset=")?;
    writer.write_str(transfer.asset_id.as_deref().unwrap_or(""))?;
    writer.write_str(":native=")?;
    if let Some(value) = transfer.native_amount {
        write_hex_bytes(writer, &value.to_le_bytes())?;
    }
    writer.write_str(":decimals=")?;
    if let Some(value) = transfer.decimals {
        write_hex_bytes(writer, &[value])?;
    }
    writer.write_str(":gas_asset=")?;
    writer.write_str(transfer.gas_asset_id.as_deref().unwrap_or(""))?;
    writer.write_str(":gas_native=")?;
    if let Some(value) = transfer.gas_native_amount {
        write_hex_bytes(writer, &value.to_le_bytes())?;
    }
    Ok(())
}

fn write_hex_bytes<W: Write>(writer: &mut W, bytes: &[u8]) -> fmt::Result {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in bytes {
        writer.write_char(HEX[(byte >> 4) as usize] as char)?;
        writer.write_char(HEX[(byte & 0x0f) as usize] as char)?;
    }
    Ok(())
}
