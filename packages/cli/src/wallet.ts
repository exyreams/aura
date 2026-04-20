import { readFileSync } from "node:fs";

import { Keypair } from "@solana/web3.js";

import { expandHome } from "./config.js";

export function loadKeypair(walletPath: string): Keypair {
  const resolvedPath = expandHome(walletPath);

  let secret: Uint8Array;
  try {
    secret = new Uint8Array(JSON.parse(readFileSync(resolvedPath, "utf8")) as number[]);
  } catch {
    throw new Error(
      `Could not load wallet keypair from ${resolvedPath}. ` +
      `Run 'aura config init' or pass --wallet /path/to/id.json.`,
    );
  }

  try {
    return Keypair.fromSecretKey(secret);
  } catch {
    throw new Error(
      `Wallet file at ${resolvedPath} is not a valid Solana keypair JSON array.`,
    );
  }
}
