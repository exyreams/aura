import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

export function loadKeypair(path: string) {
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}
