/**
 * Independent Anchor discriminator computation.
 *
 * Anchor derives 8-byte discriminators as the first 8 bytes of a SHA-256 hash
 * over a namespaced name:
 *   - instruction: sha256("global:<snake_case_name>")[0..8]
 *   - account:     sha256("account:<PascalCaseName>")[0..8]
 *   - event:       sha256("event:<PascalCaseName>")[0..8]
 *
 * These helpers recompute the discriminators from scratch with `@noble/hashes`
 * so tests can cross-check the SDK and the generated IDL against an oracle that
 * shares no code with either. If the SDK and the IDL ever agree with each other
 * but both drift from the protocol's hashing rule, this catches it.
 */

import { sha256 } from "@noble/hashes/sha2.js";

function discriminator(namespace: string, name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`${namespace}:${name}`)).slice(0, 8);
}

/** `sha256("global:<name>")[0..8]` — the on-chain instruction discriminator. */
export function instructionDiscriminator(name: string): Uint8Array {
  return discriminator("global", name);
}

/** `sha256("account:<Name>")[0..8]` — the Anchor account discriminator. */
export function accountDiscriminator(name: string): Uint8Array {
  return discriminator("account", name);
}

/** `sha256("event:<Name>")[0..8]` — the Anchor event discriminator. */
export function eventDiscriminator(name: string): Uint8Array {
  return discriminator("event", name);
}

/** Byte-for-byte equality for two discriminator-shaped buffers. */
export function bytesEqual(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Hex string for diagnostics in assertion messages. */
export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
