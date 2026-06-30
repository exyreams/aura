#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const generatedPath = path.resolve(dirname, "../../../sdk-ts/src/generated/instructions.generated.ts");
const devnetDir = path.resolve(dirname, "../devnet");

function readInstructionDefinitions() {
  const source = readFileSync(generatedPath, "utf8");
  const startMarker = "export const AURA_INSTRUCTION_DEFINITIONS = ";
  const endMarker = "] as const satisfies readonly AuraInstructionDefinition[];";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error(`Unable to locate AURA_INSTRUCTION_DEFINITIONS in ${generatedPath}`);
  }

  const literal = source.slice(start + startMarker.length, end + 1);
  return JSON.parse(literal);
}

function listTypeScriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const definitions = readInstructionDefinitions();
const devnetSource = listTypeScriptFiles(devnetDir)
  .map((filePath) => readFileSync(filePath, "utf8"))
  .join("\n");

const covered = definitions.filter((definition) => {
  const methodPattern = escapeRegExp(definition.methodName);
  return new RegExp(`\\binstructions\\.[a-zA-Z0-9_]+\\.${methodPattern}\\b`).test(devnetSource);
});

const missing = definitions.filter((definition) => !covered.includes(definition));

console.log(
  JSON.stringify(
    {
      total: definitions.length,
      covered: covered.length,
      missing: missing.length,
    },
    null,
    2,
  ),
);

if (missing.length > 0) {
  console.error("Missing devnet coverage:");
  for (const definition of missing) {
    console.error(`- ${definition.methodName} (${definition.name})`);
  }
  process.exitCode = 1;
}
