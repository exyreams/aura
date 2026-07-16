/**
 * Solana connection + AuraClient factory. Read-only — no keypair required.
 * Write tools obtain signing material from the signing service, never here.
 */

import { AURA_PROGRAM_ID, AuraClient } from "@aura-protocol/sdk-ts";
import { Connection, PublicKey } from "@solana/web3.js";

export interface SolanaContext {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly client: AuraClient;
  readonly cluster: string;
}

export interface SolanaContextOptions {
  readonly rpcUrl: string;
  readonly programId?: string | PublicKey;
  readonly cluster?: string;
  readonly commitment?: "processed" | "confirmed" | "finalized";
}

export function createSolanaContext(
  options: SolanaContextOptions,
): SolanaContext {
  const connection = new Connection(
    options.rpcUrl,
    options.commitment ?? "confirmed",
  );
  const programId =
    options.programId instanceof PublicKey
      ? options.programId
      : new PublicKey(options.programId ?? AURA_PROGRAM_ID);
  const client = new AuraClient({ connection, programId });
  return {
    connection,
    programId,
    client,
    cluster: options.cluster ?? "devnet",
  };
}
