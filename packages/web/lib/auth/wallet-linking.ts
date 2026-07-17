import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const SOLANA_ACCOUNT_CHAIN_ID = 2;
export const SOLANA_ACCOUNT_CHAIN_NAME = "Solana";
export const WALLET_LINK_VERSION = "aura.wallet_link.v1";

export function normalizeSolanaWalletAddress(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Wallet address is required.");
  }

  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw new Error("Wallet address must be a valid Solana public key.");
  }
}

export function buildWalletLinkMessage(input: {
  origin: string;
  email: string | null;
  userId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}) {
  return [
    "AURA wallet link request",
    "",
    `Origin: ${input.origin}`,
    `Account ID: ${input.userId}`,
    `Email: ${input.email ?? "unavailable"}`,
    `Wallet: ${input.walletAddress}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expires At: ${input.expiresAt}`,
    `Version: ${WALLET_LINK_VERSION}`,
    "",
    "Only sign this message from the AURA application you trust.",
  ].join("\n");
}

export function verifySolanaWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  const publicKey = new PublicKey(input.walletAddress);
  const messageBytes = new TextEncoder().encode(input.message);
  const signatureBytes = bs58.decode(input.signature);

  if (signatureBytes.length !== 64) {
    return false;
  }

  return ed25519.verify(signatureBytes, messageBytes, publicKey.toBytes(), {
    zip215: false,
  });
}
