import { PublicKey } from "@solana/web3.js";
import {
  Chain as EncryptChain,
  createEncryptClient,
  DEVNET_PRE_ALPHA_GRPC_URL as ENCRYPT_GRPC_URL,
  encodeReadCiphertextMessage,
} from "./vendor/encrypt/grpc.js";
import { createIkaClient } from "./vendor/ika/grpc.js";

const IKA_GRPC_URL = "pre-alpha-dev-1.ika.ika-network.net:443";
export { ENCRYPT_GRPC_URL, IKA_GRPC_URL };

const FHE_TYPE_UINT64 = 0;
export const ENCRYPT_NETWORK_KEY = Buffer.alloc(32, 0x55);

export async function encryptU64(
  value: number | bigint,
  authorized: PublicKey,
  grpcUrl = ENCRYPT_GRPC_URL,
) {
  const client = createEncryptClient(grpcUrl);
  try {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigUInt64LE(BigInt(value), 0);
    const result = await client.createInput({
      chain: EncryptChain.Solana,
      inputs: [{ ciphertextBytes: valueBuf, fheType: FHE_TYPE_UINT64 }],
      proof: Buffer.alloc(0),
      authorized: authorized.toBuffer(),
      networkEncryptionPublicKey: ENCRYPT_NETWORK_KEY,
    });
    const id = result.ciphertextIdentifiers[0];
    if (!id || id.length !== 32) {
      throw new Error("Encrypt service returned an invalid ciphertext identifier");
    }
    return new PublicKey(id);
  } finally {
    client.close();
  }
}

export async function encryptU64Batch(
  values: Array<number | bigint>,
  authorized: PublicKey,
  grpcUrl = ENCRYPT_GRPC_URL,
) {
  if (values.length === 0) {
    return [];
  }
  const client = createEncryptClient(grpcUrl);
  try {
    const result = await client.createInput({
      chain: EncryptChain.Solana,
      inputs: values.map((value) => {
        const valueBuf = Buffer.alloc(8);
        valueBuf.writeBigUInt64LE(BigInt(value), 0);
        return { ciphertextBytes: valueBuf, fheType: FHE_TYPE_UINT64 };
      }),
      proof: Buffer.alloc(0),
      authorized: authorized.toBuffer(),
      networkEncryptionPublicKey: ENCRYPT_NETWORK_KEY,
    });
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

export async function readCiphertext(
  ciphertextId: PublicKey,
  signer: PublicKey,
  grpcUrl = ENCRYPT_GRPC_URL,
) {
  const client = createEncryptClient(grpcUrl);
  try {
    const message = encodeReadCiphertextMessage(
      0,
      ciphertextId.toBuffer(),
      Buffer.alloc(32),
      1n,
    );
    const result = await client.readCiphertext({
      message,
      signature: Buffer.alloc(64),
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

export async function readU64Ciphertext(
  ciphertextId: PublicKey,
  signer: PublicKey,
  grpcUrl = ENCRYPT_GRPC_URL,
) {
  const { value } = await readCiphertext(ciphertextId, signer, grpcUrl);
  if (value.length < 8) {
    throw new Error(`Expected 8 bytes for u64, got ${value.length}`);
  }
  return value.readBigUInt64LE(0);
}

export async function requestDwalletSign(
  senderPubkey: PublicKey,
  dwalletAddr: PublicKey,
  message: Buffer,
  txSignature: Buffer,
  grpcUrl = IKA_GRPC_URL,
) {
  const client = createIkaClient(grpcUrl);
  try {
    const presignId = await client.requestPresign(
      senderPubkey.toBuffer(),
      dwalletAddr.toBuffer(),
    );
    const signature = await client.requestSign(
      senderPubkey.toBuffer(),
      dwalletAddr.toBuffer(),
      message,
      presignId,
      txSignature,
    );
    return Buffer.from(signature);
  } finally {
    client.close();
  }
}
