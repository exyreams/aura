/**
 * Shared Zod schemas. Strict — extra fields are rejected, not ignored.
 */

import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

/** A base58-encoded Solana pubkey. Trims surrounding whitespace, then validates. */
export const PubkeyString = z
  .string()
  .trim()
  .min(32)
  .max(44)
  .refine(
    (value) => {
      try {
        new PublicKey(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "must be a base58 Solana public key" },
  );

/**
 * Helper to turn a pubkey-string field into an actual `PublicKey` after parsing.
 *
 * Used inside `.transform(...)` blocks so callers receive ready-to-use values
 * instead of strings that need re-validating.
 */
export function toPubkey(value: string): PublicKey {
  return new PublicKey(value);
}

/** Bounded agent-id label. Same chars as AURA treasury seeds tolerate. */
export const AgentIdString = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_\-.]+$/u, {
    message: "agent id must be alphanumeric plus `_`, `-`, `.`",
  });

/** Caller-supplied idempotency key. Optional everywhere it appears. */
export const IdempotencyKey = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u, {
    message: "idempotency key must be URL-safe (alphanumeric, `_`, `-`)",
  });

/**
 * Strict-object helper. Equivalent to `z.object({...}).strict()` but exported
 * so every tool spells "strict" the same way.
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
