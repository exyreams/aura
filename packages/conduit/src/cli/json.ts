import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function parseJsonInput(
  value: string | undefined,
  label: string,
): JsonRecord | unknown[] {
  if (value === undefined || value.length === 0) {
    return {};
  }
  const source = value.startsWith("@") ? value.slice(1) : value;
  const resolved = expandHome(source);
  const raw = existsSync(resolved) ? readFileSync(resolved, "utf8") : value;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) && !Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object or array.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} must be valid JSON or @/path/to/file.json.`);
    }
    throw error;
  }
}

export function parseKeyValuePairs(values: string[] | undefined): JsonRecord {
  const out: JsonRecord = {};
  for (const entry of values ?? []) {
    const idx = entry.indexOf("=");
    if (idx <= 0) {
      throw new Error(`Expected key=value, got '${entry}'.`);
    }
    const key = entry.slice(0, idx);
    const raw = entry.slice(idx + 1);
    try {
      out[key] =
        /^-?\d+$/.test(raw) && raw.length > 15
          ? raw
          : (JSON.parse(raw) as unknown);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

export function mergeJsonInput(
  base: JsonRecord | unknown[],
  overrides: JsonRecord,
): JsonRecord | unknown[] {
  if (Array.isArray(base)) {
    if (Object.keys(overrides).length > 0) {
      throw new Error(
        "Cannot combine array JSON input with key=value overrides.",
      );
    }
    return base;
  }
  return { ...base, ...overrides };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
