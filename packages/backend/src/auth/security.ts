import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

import { loadConfig } from "../config.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function parseHexKey(value: string, label: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be 32 random bytes encoded as 64 hex characters.`);
  }
  return Buffer.from(value, "hex");
}

export function getEncryptionKey() {
  return parseHexKey(loadConfig().encryptionKeyHex, "AURA_ENCRYPTION_KEY");
}

export function getJwtSecret() {
  return parseHexKey(loadConfig().jwtSecretHex, "AURA_JWT_SECRET");
}

export function encryptSecretKey(secretKey: Uint8Array) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const plaintext = Buffer.from(secretKey);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      encryptedSecretKey: Buffer.concat([ciphertext, tag]).toString("hex"),
      encryptionIv: iv.toString("hex"),
    };
  } finally {
    plaintext.fill(0);
    key.fill(0);
  }
}

export function decryptSecretKey(input: {
  encryptedSecretKey: string;
  encryptionIv: string;
}) {
  const key = getEncryptionKey();
  const payload = Buffer.from(input.encryptedSecretKey, "hex");
  const iv = Buffer.from(input.encryptionIv, "hex");
  if (iv.length !== 12) {
    key.fill(0);
    throw new Error("Encrypted keypair IV must be 12 bytes.");
  }
  if (payload.length <= 16) {
    key.fill(0);
    throw new Error("Encrypted keypair payload is too short.");
  }
  const ciphertext = payload.subarray(0, payload.length - 16);
  const tag = payload.subarray(payload.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } finally {
    key.fill(0);
  }
}

export function zeroSecretKey(secretKey: Uint8Array) {
  secretKey.fill(0);
}

export function verifySolanaSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  const wallet = new PublicKey(input.walletAddress);
  const publicKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]),
    format: "der",
    type: "spki",
  });
  const signature = bs58.decode(input.signature);
  return verify(null, Buffer.from(input.message, "utf8"), publicKey, signature);
}
