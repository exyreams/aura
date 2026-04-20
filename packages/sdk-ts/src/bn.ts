/**
 * BN.js convenience utilities.
 *
 * All timestamp and amount parameters on `AuraClient` accept `BNish` so
 * callers can pass plain numbers, bigints, or decimal strings without
 * constructing a `BN` manually.
 */

import BN from "bn.js";

/** Any value that can be losslessly converted to a `BN`. */
export type BNish = BN | bigint | number | string;

/**
 * Converts a `BNish` value to a `BN`.
 *
 * - `BN` instances are returned as-is.
 * - `bigint` values are stringified to avoid precision loss.
 * - `number` values must be safe integers; throws otherwise.
 * - `string` values are parsed as base-10 decimal.
 */
export function toBN(value: BNish): BN {
  if (BN.isBN(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return new BN(value.toString(10), 10);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Expected a safe integer, got ${value}`);
    }
    return new BN(value);
  }
  // string — parse as base-10 decimal
  return new BN(value, 10);
}
