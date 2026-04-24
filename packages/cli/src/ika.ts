/**
 * Thin wrappers around the Ika Encrypt and dWallet gRPC clients.
 *
 * Both clients are pre-alpha — data is public plaintext on-chain, no real
 * FHE or MPC security yet. The interfaces match the Rust smoke tests in
 * smoke/aura-devnet/ so the full confidential + execution flow works end-to-end.
 *
 * Encrypt gRPC: pre-alpha-dev-1.encrypt.ika-network.net:443
 * dWallet gRPC: pre-alpha-dev-1.ika.ika-network.net:443
 */

import { PublicKey } from "@solana/web3.js";
import {
  createEncryptClient,
  encodeReadCiphertextMessage,
  Chain as EncryptChain,
  DEVNET_PRE_ALPHA_GRPC_URL as ENCRYPT_GRPC_URL,
} from "./vendor/encrypt/grpc.js";
import {
  createIkaClient,
} from "./vendor/ika/grpc.js";

const IKA_GRPC_URL = "pre-alpha-dev-1.ika.ika-network.net:443";

export { ENCRYPT_GRPC_URL, IKA_GRPC_URL };

/**
 * FHE type for u64 values — matches `ENCRYPT_FHE_UINT64` in the Rust program.
 * In pre-alpha mode the Encrypt executor accepts any value here.
 */
const FHE_TYPE_UINT64 = 0;

/**
 * The 32-byte network encryption public key used by the pre-alpha Encrypt service.
 * Matches `ENCRYPT_NETWORK_KEY` in the Rust smoke tests.
 */
export const ENCRYPT_NETWORK_KEY = Buffer.alloc(32, 0x55);

/**
 * Encrypts a single u64 value via the Ika Encrypt gRPC service and returns
 * the on-chain ciphertext account pubkey.
 *
 * In pre-alpha mode the value is stored as plaintext — no real FHE yet.
 * The returned pubkey is the `handlePda` that must be verified on-chain
 * before it can be used in a confidential proposal.
 *
 * @param value       The u64 value to encrypt (as a number or bigint).
 * @param authorized  The Solana pubkey authorized to use this ciphertext
 *                    (typically the AURA program ID).
 * @param grpcUrl     Override the gRPC endpoint (defaults to devnet pre-alpha).
 */
export async function encryptU64(
  value: number | bigint,
  authorized: PublicKey,
  grpcUrl: string = ENCRYPT_GRPC_URL,
): Promise<PublicKey> {
  const client = createEncryptClient(grpcUrl);
  try {
    // Encode the value as 8 little-endian bytes (u64 LE)
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigUInt64LE(BigInt(value), 0);

    const result = await client.createInput({
      chain: EncryptChain.Solana,
      inputs: [
        {
          ciphertextBytes: valueBuf,
          fheType: FHE_TYPE_UINT64,
        },
      ],
      proof: Buffer.alloc(0),
      authorized: authorized.toBuffer(),
      networkEncryptionPublicKey: ENCRYPT_NETWORK_KEY,
    });

    if (!result.ciphertextIdentifiers[0] || result.ciphertextIdentifiers[0].length !== 32) {
      throw new Error("Encrypt service returned an invalid ciphertext identifier");
    }

    return new PublicKey(result.ciphertextIdentifiers[0]);
  } finally {
    client.close();
  }
}

/**
 * Encrypts multiple u64 values in a single gRPC call (more efficient than
 * calling `encryptU64` separately for each value).
 *
 * Returns one pubkey per input value in the same order.
 */
export async function encryptU64Batch(
  values: (number | bigint)[],
  authorized: PublicKey,
  grpcUrl: string = ENCRYPT_GRPC_URL,
): Promise<PublicKey[]> {
  if (values.length === 0) {
    return [];
  }

  const client = createEncryptClient(grpcUrl);
  try {
    const inputs = values.map((value) => {
      const valueBuf = Buffer.alloc(8);
      valueBuf.writeBigUInt64LE(BigInt(value), 0);
      return { ciphertextBytes: valueBuf, fheType: FHE_TYPE_UINT64 };
    });

    const result = await client.createInput({
      chain: EncryptChain.Solana,
      inputs,
      proof: Buffer.alloc(0),
      authorized: authorized.toBuffer(),
      networkEncryptionPublicKey: ENCRYPT_NETWORK_KEY,
    });

    if (result.ciphertextIdentifiers.length !== values.length) {
      throw new Error(
        `Encrypt service returned ${result.ciphertextIdentifiers.length} identifiers for ${values.length} inputs`,
      );
    }

    return result.ciphertextIdentifiers.map((id) => {
      if (!id || id.length !== 32) {
        throw new Error("Encrypt service returned an invalid ciphertext identifier");
      }
      return new PublicKey(id);
    });
  } finally {
    client.close();
  }
}

/**
 * Reads a decrypted ciphertext value from the Encrypt network.
 *
 * In pre-alpha mode this returns the plaintext directly.
 * The returned buffer contains the raw bytes (8 bytes for u64 LE).
 *
 * @param ciphertextId  The on-chain ciphertext account pubkey.
 * @param signer        The pubkey authorized to read this ciphertext.
 * @param grpcUrl       Override the gRPC endpoint.
 */
export async function readCiphertext(
  ciphertextId: PublicKey,
  signer: PublicKey,
  grpcUrl: string = ENCRYPT_GRPC_URL,
): Promise<{ value: Buffer; fheType: number; digest: Buffer }> {
  const client = createEncryptClient(grpcUrl);
  try {
    // Build a BCS-encoded ReadCiphertextMessage
    // In pre-alpha, signature and reencryption key can be zero-filled
    const message = encodeReadCiphertextMessage(
      0, // chain = Solana
      ciphertextId.toBuffer(),
      Buffer.alloc(32), // zero reencryption key (pre-alpha: plaintext returned directly)
      1n,               // epoch = 1
    );

    const result = await client.readCiphertext({
      message,
      signature: Buffer.alloc(64), // zero signature (pre-alpha: not validated)
      signer: signer.toBuffer(),
    });

    return {
      value: result.value as Buffer,
      fheType: result.fheType,
      digest: result.digest as Buffer,
    };
  } finally {
    client.close();
  }
}

/**
 * Reads a u64 ciphertext and returns the decoded value.
 * Convenience wrapper around `readCiphertext` for u64 values.
 */
export async function readU64Ciphertext(
  ciphertextId: PublicKey,
  signer: PublicKey,
  grpcUrl: string = ENCRYPT_GRPC_URL,
): Promise<bigint> {
  const { value } = await readCiphertext(ciphertextId, signer, grpcUrl);
  if (value.length < 8) {
    throw new Error(`Expected 8 bytes for u64, got ${value.length}`);
  }
  return value.readBigUInt64LE(0);
}

/**
 * Drives the dWallet presign + sign flow via the Ika dWallet gRPC service.
 *
 * This is called after `execute_pending` creates the `MessageApproval` account
 * on-chain. The dWallet network processes the presign and sign requests and
 * writes the signature back to the `MessageApproval` account.
 *
 * @param senderPubkey  The Solana pubkey of the transaction sender (payer).
 * @param dwalletAddr   The on-chain dWallet account pubkey (32 bytes).
 * @param message       The message bytes to sign (keccak256 digest of the proposal).
 * @param txSignature   The Solana transaction signature from `execute_pending`
 *                      (used as the approval proof).
 * @param grpcUrl       Override the gRPC endpoint.
 * @returns The dWallet signature bytes.
 */
export async function requestDwalletSign(
  senderPubkey: PublicKey,
  dwalletAddr: PublicKey,
  message: Buffer,
  txSignature: Buffer,
  grpcUrl: string = IKA_GRPC_URL,
): Promise<Buffer> {
  const client = createIkaClient(grpcUrl);
  try {
    const senderBytes = senderPubkey.toBuffer();
    const dwalletBytes = dwalletAddr.toBuffer();

    // Step 1: request presign
    const presignId = await client.requestPresign(senderBytes, dwalletBytes);

    // Step 2: request sign with the presign ID and approval proof
    const signature = await client.requestSign(
      senderBytes,
      dwalletBytes,
      message,
      presignId,
      txSignature,
    );

    return Buffer.from(signature);
  } finally {
    client.close();
  }
}
