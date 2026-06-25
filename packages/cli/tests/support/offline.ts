/**
 * Offline (in-process) CLI test harness.
 *
 * Runs the CLI inside the test process by building the commander program and
 * parsing argv directly — no child process, no network. stdout/stderr are
 * captured by temporarily replacing the stream writers so we can assert on
 * rendered output and parse `--json` payloads. Commander's `exitOverride` turns
 * process exits (version/help/parse errors) into thrown `CommanderError`s,
 * which we capture rather than letting them kill the test runner.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Keypair } from "@solana/web3.js";

import { createProgram } from "../../src/index.js";

export interface CliRun {
  stdout: string;
  stderr: string;
  /** A thrown CommanderError (version/help/parse) or command error, if any. */
  error?: Error & { code?: string; exitCode?: number };
}

/** Runs `aura <args>` in-process and captures all stdout/stderr. */
export async function runCli(args: string[]): Promise<CliRun> {
  let stdout = "";
  let stderr = "";
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);

  // biome-ignore lint/suspicious/noExplicitAny: stream writer override
  process.stdout.write = ((chunk: any) => {
    stdout += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  }) as typeof process.stdout.write;
  // biome-ignore lint/suspicious/noExplicitAny: stream writer override
  process.stderr.write = ((chunk: any) => {
    stderr += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;

  let error: (Error & { code?: string; exitCode?: number }) | undefined;
  try {
    await createProgram()
      .exitOverride()
      .parseAsync(["node", "aura", ...args]);
  } catch (caught) {
    error = caught as Error & { code?: string; exitCode?: number };
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }

  return { stdout, stderr, error };
}

/** Runs the CLI with `--json` and parses the stdout payload. */
export async function runCliJson<T>(args: string[]): Promise<T> {
  const finalArgs = args.includes("--json") ? args : ["--json", ...args];
  const { stdout, stderr, error } = await runCli(finalArgs);
  if (
    error &&
    error.code !== "commander.version" &&
    error.code !== "commander.helpDisplayed"
  ) {
    throw new Error(
      `aura ${finalArgs.join(" ")} threw: ${error.message}\n${stderr}`,
    );
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`aura ${finalArgs.join(" ")} produced no JSON.\n${stderr}`);
  }
  return JSON.parse(trimmed) as T;
}

/** A throwaway keypair file in a temp dir; returns the path and a cleanup fn. */
export function tempWallet(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "aura-cli-test-"));
  const path = join(dir, "id.json");
  writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)));
  return {
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
