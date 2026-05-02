import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

export function loadKeypair(path: string): Keypair {
  const b64 = process.env.AURA_KEYPAIR_B64?.trim();
  if (b64) {
    const raw = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
