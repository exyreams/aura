/** Generated instruction builders for the operational domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `close_activity_log` instruction. */
export type CloseActivityLogInput = {
  accounts: MethodAccounts<"closeActivityLog">;
  args?: undefined;
};

/** Builds a `close_activity_log` instruction. */
export function closeActivityLog(
  client: AuraClient,
  input: CloseActivityLogInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeActivityLog()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeActivityLogInstruction = closeActivityLog;

/** Builds and sends a `close_activity_log` transaction. */
export async function sendCloseActivityLog(
  client: AuraClient,
  payer: Signer,
  input: CloseActivityLogInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeActivityLog(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_external_liveness` instruction. */
export type CloseExternalLivenessInput = {
  accounts: MethodAccounts<"closeExternalLiveness">;
  args?: undefined;
};

/** Builds a `close_external_liveness` instruction. */
export function closeExternalLiveness(
  client: AuraClient,
  input: CloseExternalLivenessInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeExternalLiveness()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeExternalLivenessInstruction = closeExternalLiveness;

/** Builds and sends a `close_external_liveness` transaction. */
export async function sendCloseExternalLiveness(
  client: AuraClient,
  payer: Signer,
  input: CloseExternalLivenessInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeExternalLiveness(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_health_score` instruction. */
export type CloseHealthScoreInput = {
  accounts: MethodAccounts<"closeHealthScore">;
  args?: undefined;
};

/** Builds a `close_health_score` instruction. */
export function closeHealthScore(
  client: AuraClient,
  input: CloseHealthScoreInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeHealthScore()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeHealthScoreInstruction = closeHealthScore;

/** Builds and sends a `close_health_score` transaction. */
export async function sendCloseHealthScore(
  client: AuraClient,
  payer: Signer,
  input: CloseHealthScoreInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeHealthScore(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_snapshot` instruction. */
export type CloseSnapshotInput = {
  accounts: MethodAccounts<"closeSnapshot">;
  args?: undefined;
};

/** Builds a `close_snapshot` instruction. */
export function closeSnapshot(
  client: AuraClient,
  input: CloseSnapshotInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeSnapshot()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeSnapshotInstruction = closeSnapshot;

/** Builds and sends a `close_snapshot` transaction. */
export async function sendCloseSnapshot(
  client: AuraClient,
  payer: Signer,
  input: CloseSnapshotInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeSnapshot(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_activity_log` instruction. */
export type InitActivityLogInput = {
  accounts: MethodAccounts<"initActivityLog">;
  args?: undefined;
};

/** Builds a `init_activity_log` instruction. */
export function initActivityLog(
  client: AuraClient,
  input: InitActivityLogInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initActivityLog()
    .accountsStrict(input.accounts)
    .instruction();
}

export const initActivityLogInstruction = initActivityLog;

/** Builds and sends a `init_activity_log` transaction. */
export async function sendInitActivityLog(
  client: AuraClient,
  payer: Signer,
  input: InitActivityLogInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initActivityLog(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_external_liveness` instruction. */
export type InitExternalLivenessInput = {
  accounts: MethodAccounts<"initExternalLiveness">;
  args: MethodArgs<"initExternalLiveness">[0];
};

/** Builds a `init_external_liveness` instruction. */
export function initExternalLiveness(
  client: AuraClient,
  input: InitExternalLivenessInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initExternalLiveness(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initExternalLivenessInstruction = initExternalLiveness;

/** Builds and sends a `init_external_liveness` transaction. */
export async function sendInitExternalLiveness(
  client: AuraClient,
  payer: Signer,
  input: InitExternalLivenessInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initExternalLiveness(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_health_score` instruction. */
export type InitHealthScoreInput = {
  accounts: MethodAccounts<"initHealthScore">;
  args: {
    now: MethodArgs<"initHealthScore">[0];
  };
};

/** Builds a `init_health_score` instruction. */
export function initHealthScore(
  client: AuraClient,
  input: InitHealthScoreInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initHealthScore(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initHealthScoreInstruction = initHealthScore;

/** Builds and sends a `init_health_score` transaction. */
export async function sendInitHealthScore(
  client: AuraClient,
  payer: Signer,
  input: InitHealthScoreInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initHealthScore(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `refresh_external_liveness` instruction. */
export type RefreshExternalLivenessInput = {
  accounts: MethodAccounts<"refreshExternalLiveness">;
  args: MethodArgs<"refreshExternalLiveness">[0];
};

/** Builds a `refresh_external_liveness` instruction. */
export function refreshExternalLiveness(
  client: AuraClient,
  input: RefreshExternalLivenessInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .refreshExternalLiveness(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const refreshExternalLivenessInstruction = refreshExternalLiveness;

/** Builds and sends a `refresh_external_liveness` transaction. */
export async function sendRefreshExternalLiveness(
  client: AuraClient,
  payer: Signer,
  input: RefreshExternalLivenessInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await refreshExternalLiveness(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `refresh_health_score` instruction. */
export type RefreshHealthScoreInput = {
  accounts: MethodAccounts<"refreshHealthScore">;
  args: {
    now: MethodArgs<"refreshHealthScore">[0];
  };
};

/** Builds a `refresh_health_score` instruction. */
export function refreshHealthScore(
  client: AuraClient,
  input: RefreshHealthScoreInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .refreshHealthScore(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const refreshHealthScoreInstruction = refreshHealthScore;

/** Builds and sends a `refresh_health_score` transaction. */
export async function sendRefreshHealthScore(
  client: AuraClient,
  payer: Signer,
  input: RefreshHealthScoreInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await refreshHealthScore(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_scoped_pause` instruction. */
export type SetScopedPauseInput = {
  accounts: MethodAccounts<"setScopedPause">;
  args: MethodArgs<"setScopedPause">[0];
};

/** Builds a `set_scoped_pause` instruction. */
export function setScopedPause(
  client: AuraClient,
  input: SetScopedPauseInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setScopedPause(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setScopedPauseInstruction = setScopedPause;

/** Builds and sends a `set_scoped_pause` transaction. */
export async function sendSetScopedPause(
  client: AuraClient,
  payer: Signer,
  input: SetScopedPauseInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setScopedPause(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `take_snapshot` instruction. */
export type TakeSnapshotInput = {
  accounts: MethodAccounts<"takeSnapshot">;
  args: {
    snapshotIndex: MethodArgs<"takeSnapshot">[0];
    now: MethodArgs<"takeSnapshot">[1];
  };
};

/** Builds a `take_snapshot` instruction. */
export function takeSnapshot(
  client: AuraClient,
  input: TakeSnapshotInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .takeSnapshot(input.args.snapshotIndex, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const takeSnapshotInstruction = takeSnapshot;

/** Builds and sends a `take_snapshot` transaction. */
export async function sendTakeSnapshot(
  client: AuraClient,
  payer: Signer,
  input: TakeSnapshotInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await takeSnapshot(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
