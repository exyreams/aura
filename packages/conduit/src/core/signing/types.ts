/**
 * Signing-service interface. The signing service is the *only* component
 * that ever holds unwrapped `session_sk` material; every other module calls
 * this interface and never sees raw key bytes.
 */

import type {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export interface SignRequest {
  readonly sessionId: string;
  /** Either a legacy or versioned transaction; the service signs in place. */
  readonly transaction: Transaction | VersionedTransaction;
}

export interface SignResult {
  readonly signedTransaction: Transaction | VersionedTransaction;
  readonly publicKey: PublicKey;
}

export interface SigningService {
  /** Returns the public key the service can sign as for this session. */
  publicKeyFor(sessionId: string): Promise<PublicKey>;
  /** Signs the transaction with the session's key. Rate-limited internally. */
  sign(request: SignRequest): Promise<SignResult>;
  /** Test/dev-only: produces the keypair. Production impls throw. */
  exposeKeypair?(sessionId: string): Keypair;
}
