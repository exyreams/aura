/**
 * Placeholder for KMS-backed signing.
 *
 * The production signing service runs in its own process, holds nothing in
 * memory until it receives an authenticated unwrap request, and calls out to
 * AWS KMS / GCP KMS / HSM to unwrap a per-session encrypted secret key. This
 * file documents the interface so the rest of Conduit can target it; the
 * implementation lands once the infra (KMS key, IAM role, dedicated host) is
 * provisioned.
 */

import type { Keypair, PublicKey } from "@solana/web3.js";

import { ConduitError } from "../errors.js";
import type { SigningService, SignRequest, SignResult } from "./types.js";

export interface KmsSigningOptions {
  /** Endpoint of the isolated signing service. */
  readonly endpoint: string;
  /** Mutual-TLS client cert path. */
  readonly clientCertPath?: string;
  /** KMS key ARN / resource name used to wrap session keys. */
  readonly kmsKey: string;
}

/**
 * Throws on every call. Replaced with a real implementation once the signing
 * service host is provisioned; until then any code that asks for KMS signing
 * fails fast rather than silently downgrading to in-memory.
 */
export class KmsSigningServiceStub implements SigningService {
  constructor(private readonly options: KmsSigningOptions) {}

  async publicKeyFor(_sessionId: string): Promise<PublicKey> {
    throw this.unavailable();
  }

  async sign(_request: SignRequest): Promise<SignResult> {
    throw this.unavailable();
  }

  exposeKeypair(_sessionId: string): Keypair {
    throw this.unavailable();
  }

  private unavailable(): ConduitError {
    return new ConduitError(
      "upstream_unavailable",
      `KMS signing service is not yet provisioned (endpoint=${this.options.endpoint}). ` +
        "Run Conduit with --signing-mode in-memory for local dev.",
    );
  }
}
