/** Generated utilities to parse AURA program errors. Do not edit. */

import { AURA_ERROR_DEFINITIONS } from "./codes.js";

export type ParsedAuraError = {
  code: number;
  name: string;
  message: string;
  cause: unknown;
};

const ERRORS_BY_CODE: Map<number, (typeof AURA_ERROR_DEFINITIONS)[number]> =
  new Map(AURA_ERROR_DEFINITIONS.map((error) => [error.code, error]));

export function getAuraErrorCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      error?: { errorCode?: { number?: unknown } };
    };
    if (typeof candidate.code === "number") return candidate.code;
    if (typeof candidate.error?.errorCode?.number === "number")
      return candidate.error.errorCode.number;
  }
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (hex?.[1]) return Number.parseInt(hex[1], 16);
  return null;
}

export function parseAuraError(error: unknown): ParsedAuraError | null {
  const code = getAuraErrorCode(error);
  if (code === null) return null;
  const definition = ERRORS_BY_CODE.get(code);
  if (!definition) return null;
  return {
    code,
    name: definition.name,
    message: definition.message,
    cause: error,
  };
}

export function isAuraError(error: unknown, code?: number): boolean {
  const actual = getAuraErrorCode(error);
  return actual !== null && (code === undefined || actual === code);
}
