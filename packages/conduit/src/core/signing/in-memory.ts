/**
 * In-memory signing service for local development.
 *
 * Holds raw `Keypair`s indexed by session id. Suitable for the local dev loop
 * where the signing service runs in the same process. Production uses a
 * separate process holding KMS-unwrapped keys (see `kms-stub.ts`).
 */

import {
  type Keypair,
  type PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import { ConduitError } from "../errors.js";
import type { SigningService, SignRequest, SignResult } from "./types.js";

export interface InMemoryServiceOptions {
  /** Hard cap on signing calls per second. */
  maxSignsPerSecond?: number;
  now?: () => number;
}

export class InMemorySigningService implements SigningService {
  private readonly keypairs = new Map<string, Keypair>();
  private readonly maxSignsPerSecond: number;
  private readonly now: () => number;
  private windowStart = 0;
  private windowCount = 0;

  constructor(options: InMemoryServiceOptions = {}) {
    this.maxSignsPerSecond = options.maxSignsPerSecond ?? 5;
    this.now = options.now ?? (() => Date.now());
  }

  register(sessionId: string, keypair: Keypair): void {
    this.keypairs.set(sessionId, keypair);
  }

  unregister(sessionId: string): void {
    this.keypairs.delete(sessionId);
  }

  async publicKeyFor(sessionId: string): Promise<PublicKey> {
    const kp = this.keypairs.get(sessionId);
    if (kp === undefined) {
      throw new ConduitError(
        "unauthenticated",
        `no session key registered for ${sessionId}`,
      );
    }
    return kp.publicKey;
  }

  async sign(request: SignRequest): Promise<SignResult> {
    this.consumeRateLimit();
    const kp = this.keypairs.get(request.sessionId);
    if (kp === undefined) {
      throw new ConduitError(
        "unauthenticated",
        `no session key registered for ${request.sessionId}`,
      );
    }
    if (request.transaction instanceof VersionedTransaction) {
      request.transaction.sign([kp]);
    } else if (request.transaction instanceof Transaction) {
      request.transaction.partialSign(kp);
    } else {
      throw new ConduitError("invalid_input", "unsupported transaction type");
    }
    return { signedTransaction: request.transaction, publicKey: kp.publicKey };
  }

  exposeKeypair(sessionId: string): Keypair {
    const kp = this.keypairs.get(sessionId);
    if (kp === undefined) {
      throw new ConduitError(
        "unauthenticated",
        `no session key registered for ${sessionId}`,
      );
    }
    return kp;
  }

  private consumeRateLimit(): void {
    const now = this.now();
    if (now - this.windowStart > 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.maxSignsPerSecond) {
      throw new ConduitError(
        "rate_limited",
        `signing service rate limit exceeded (${this.maxSignsPerSecond}/s)`,
      );
    }
    this.windowCount += 1;
  }
}
