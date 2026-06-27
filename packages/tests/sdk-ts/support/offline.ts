/**
 * Offline test helpers.
 *
 * These helpers build an `AuraClient` that never talks to a real cluster.
 * Instruction builders and PDA helpers are pure/local, so a dummy connection
 * is enough to exercise the entire instruction-encoding and account-shaping
 * surface without network access.
 */

import { Connection, Keypair, type PublicKey } from "@solana/web3.js";
import { AuraClient } from "../../../sdk-ts/src/index.js";

/** A localhost connection that is never actually contacted in unit tests. */
export function offlineConnection(): Connection {
  return new Connection("http://127.0.0.1:8899", "confirmed");
}

/** Builds an offline `AuraClient`, optionally overriding the program id. */
export function offlineClient(programId?: PublicKey): AuraClient {
  return new AuraClient({ connection: offlineConnection(), programId });
}

/** Generates a throwaway public key. */
export function pk(): PublicKey {
  return Keypair.generate().publicKey;
}
