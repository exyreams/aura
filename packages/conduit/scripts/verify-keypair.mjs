import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

const secret = Uint8Array.from(
  JSON.parse(readFileSync(".dev-keypair.json", "utf8")),
);
const kp = Keypair.fromSecretKey(secret);
process.stdout.write(kp.publicKey.toBase58());
