/** Generated instruction builders for the swarm domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `close_swarm_pool` instruction. */
export type CloseSwarmPoolInput = {
  accounts: MethodAccounts<"closeSwarmPool">;
  args?: undefined;
};

/** Builds a `close_swarm_pool` instruction. */
export function closeSwarmPool(
  client: AuraClient,
  input: CloseSwarmPoolInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeSwarmPool()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeSwarmPoolInstruction = closeSwarmPool;

/** Builds and sends a `close_swarm_pool` transaction. */
export async function sendCloseSwarmPool(
  client: AuraClient,
  payer: Signer,
  input: CloseSwarmPoolInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeSwarmPool(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `configure_swarm` instruction. */
export type ConfigureSwarmInput = {
  accounts: MethodAccounts<"configureSwarm">;
  args: MethodArgs<"configureSwarm">[0];
};

/** Builds a `configure_swarm` instruction. */
export function configureSwarm(
  client: AuraClient,
  input: ConfigureSwarmInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .configureSwarm(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const configureSwarmInstruction = configureSwarm;

/** Builds and sends a `configure_swarm` transaction. */
export async function sendConfigureSwarm(
  client: AuraClient,
  payer: Signer,
  input: ConfigureSwarmInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await configureSwarm(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_swarm_pool` instruction. */
export type InitSwarmPoolInput = {
  accounts: MethodAccounts<"initSwarmPool">;
  args: MethodArgs<"initSwarmPool">[0];
};

/** Builds a `init_swarm_pool` instruction. */
export function initSwarmPool(
  client: AuraClient,
  input: InitSwarmPoolInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initSwarmPool(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initSwarmPoolInstruction = initSwarmPool;

/** Builds and sends a `init_swarm_pool` transaction. */
export async function sendInitSwarmPool(
  client: AuraClient,
  payer: Signer,
  input: InitSwarmPoolInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initSwarmPool(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `join_swarm` instruction. */
export type JoinSwarmInput = {
  accounts: MethodAccounts<"joinSwarm">;
  args: {
    now: MethodArgs<"joinSwarm">[0];
  };
};

/** Builds a `join_swarm` instruction. */
export function joinSwarm(
  client: AuraClient,
  input: JoinSwarmInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .joinSwarm(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const joinSwarmInstruction = joinSwarm;

/** Builds and sends a `join_swarm` transaction. */
export async function sendJoinSwarm(
  client: AuraClient,
  payer: Signer,
  input: JoinSwarmInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await joinSwarm(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `leave_swarm` instruction. */
export type LeaveSwarmInput = {
  accounts: MethodAccounts<"leaveSwarm">;
  args: {
    now: MethodArgs<"leaveSwarm">[0];
  };
};

/** Builds a `leave_swarm` instruction. */
export function leaveSwarm(
  client: AuraClient,
  input: LeaveSwarmInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .leaveSwarm(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const leaveSwarmInstruction = leaveSwarm;

/** Builds and sends a `leave_swarm` transaction. */
export async function sendLeaveSwarm(
  client: AuraClient,
  payer: Signer,
  input: LeaveSwarmInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await leaveSwarm(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_swarm` instruction. */
export type UpdateSwarmInput = {
  accounts: MethodAccounts<"updateSwarm">;
  args: {
    sharedPoolLimitUsd: MethodArgs<"updateSwarm">[0];
    now: MethodArgs<"updateSwarm">[1];
  };
};

/** Builds a `update_swarm` instruction. */
export function updateSwarm(
  client: AuraClient,
  input: UpdateSwarmInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateSwarm(input.args.sharedPoolLimitUsd, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateSwarmInstruction = updateSwarm;

/** Builds and sends a `update_swarm` transaction. */
export async function sendUpdateSwarm(
  client: AuraClient,
  payer: Signer,
  input: UpdateSwarmInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateSwarm(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
