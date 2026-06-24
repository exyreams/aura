/** Generated instruction builders for the fees domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `apply_billing_template` instruction. */
export type ApplyBillingTemplateInput = {
  accounts: MethodAccounts<"applyBillingTemplate">;
  args: {
    now: MethodArgs<"applyBillingTemplate">[0];
  };
};

/** Builds a `apply_billing_template` instruction. */
export function applyBillingTemplate(
  client: AuraClient,
  input: ApplyBillingTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .applyBillingTemplate(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const applyBillingTemplateInstruction = applyBillingTemplate;

/** Builds and sends a `apply_billing_template` transaction. */
export async function sendApplyBillingTemplate(
  client: AuraClient,
  payer: Signer,
  input: ApplyBillingTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await applyBillingTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `apply_org_profile` instruction. */
export type ApplyOrgProfileInput = {
  accounts: MethodAccounts<"applyOrgProfile">;
  args: {
    now: MethodArgs<"applyOrgProfile">[0];
  };
};

/** Builds a `apply_org_profile` instruction. */
export function applyOrgProfile(
  client: AuraClient,
  input: ApplyOrgProfileInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .applyOrgProfile(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const applyOrgProfileInstruction = applyOrgProfile;

/** Builds and sends a `apply_org_profile` transaction. */
export async function sendApplyOrgProfile(
  client: AuraClient,
  payer: Signer,
  input: ApplyOrgProfileInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await applyOrgProfile(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_billing_template` instruction. */
export type CloseBillingTemplateInput = {
  accounts: MethodAccounts<"closeBillingTemplate">;
  args?: undefined;
};

/** Builds a `close_billing_template` instruction. */
export function closeBillingTemplate(
  client: AuraClient,
  input: CloseBillingTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeBillingTemplate()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeBillingTemplateInstruction = closeBillingTemplate;

/** Builds and sends a `close_billing_template` transaction. */
export async function sendCloseBillingTemplate(
  client: AuraClient,
  payer: Signer,
  input: CloseBillingTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeBillingTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_fee_schedule` instruction. */
export type CloseFeeScheduleInput = {
  accounts: MethodAccounts<"closeFeeSchedule">;
  args?: undefined;
};

/** Builds a `close_fee_schedule` instruction. */
export function closeFeeSchedule(
  client: AuraClient,
  input: CloseFeeScheduleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeFeeSchedule()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeFeeScheduleInstruction = closeFeeSchedule;

/** Builds and sends a `close_fee_schedule` transaction. */
export async function sendCloseFeeSchedule(
  client: AuraClient,
  payer: Signer,
  input: CloseFeeScheduleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeFeeSchedule(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `close_fee_vault` instruction. */
export type CloseFeeVaultInput = {
  accounts: MethodAccounts<"closeFeeVault">;
  args?: undefined;
};

/** Builds a `close_fee_vault` instruction. */
export function closeFeeVault(
  client: AuraClient,
  input: CloseFeeVaultInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .closeFeeVault()
    .accountsStrict(input.accounts)
    .instruction();
}

export const closeFeeVaultInstruction = closeFeeVault;

/** Builds and sends a `close_fee_vault` transaction. */
export async function sendCloseFeeVault(
  client: AuraClient,
  payer: Signer,
  input: CloseFeeVaultInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await closeFeeVault(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `collect_fees` instruction. */
export type CollectFeesInput = {
  accounts: MethodAccounts<"collectFees">;
  args: {
    now: MethodArgs<"collectFees">[0];
  };
};

/** Builds a `collect_fees` instruction. */
export function collectFees(
  client: AuraClient,
  input: CollectFeesInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .collectFees(input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const collectFeesInstruction = collectFees;

/** Builds and sends a `collect_fees` transaction. */
export async function sendCollectFees(
  client: AuraClient,
  payer: Signer,
  input: CollectFeesInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await collectFees(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `create_billing_template` instruction. */
export type CreateBillingTemplateInput = {
  accounts: MethodAccounts<"createBillingTemplate">;
  args: MethodArgs<"createBillingTemplate">[0];
};

/** Builds a `create_billing_template` instruction. */
export function createBillingTemplate(
  client: AuraClient,
  input: CreateBillingTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .createBillingTemplate(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const createBillingTemplateInstruction = createBillingTemplate;

/** Builds and sends a `create_billing_template` transaction. */
export async function sendCreateBillingTemplate(
  client: AuraClient,
  payer: Signer,
  input: CreateBillingTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await createBillingTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `deposit_fees` instruction. */
export type DepositFeesInput = {
  accounts: MethodAccounts<"depositFees">;
  args: {
    amount: MethodArgs<"depositFees">[0];
  };
};

/** Builds a `deposit_fees` instruction. */
export function depositFees(
  client: AuraClient,
  input: DepositFeesInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .depositFees(input.args.amount)
    .accountsStrict(input.accounts)
    .instruction();
}

export const depositFeesInstruction = depositFees;

/** Builds and sends a `deposit_fees` transaction. */
export async function sendDepositFees(
  client: AuraClient,
  payer: Signer,
  input: DepositFeesInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await depositFees(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_fee_schedule` instruction. */
export type InitFeeScheduleInput = {
  accounts: MethodAccounts<"initFeeSchedule">;
  args: {
    schedule: MethodArgs<"initFeeSchedule">[0];
    now: MethodArgs<"initFeeSchedule">[1];
  };
};

/** Builds a `init_fee_schedule` instruction. */
export function initFeeSchedule(
  client: AuraClient,
  input: InitFeeScheduleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initFeeSchedule(input.args.schedule, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initFeeScheduleInstruction = initFeeSchedule;

/** Builds and sends a `init_fee_schedule` transaction. */
export async function sendInitFeeSchedule(
  client: AuraClient,
  payer: Signer,
  input: InitFeeScheduleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initFeeSchedule(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `init_fee_vault` instruction. */
export type InitFeeVaultInput = {
  accounts: MethodAccounts<"initFeeVault">;
  args: {
    protocolFeeRecipient: MethodArgs<"initFeeVault">[0];
    now: MethodArgs<"initFeeVault">[1];
  };
};

/** Builds a `init_fee_vault` instruction. */
export function initFeeVault(
  client: AuraClient,
  input: InitFeeVaultInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initFeeVault(input.args.protocolFeeRecipient, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initFeeVaultInstruction = initFeeVault;

/** Builds and sends a `init_fee_vault` transaction. */
export async function sendInitFeeVault(
  client: AuraClient,
  payer: Signer,
  input: InitFeeVaultInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initFeeVault(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_fee_splits` instruction. */
export type SetFeeSplitsInput = {
  accounts: MethodAccounts<"setFeeSplits">;
  args: {
    splits: MethodArgs<"setFeeSplits">[0];
    lowBalanceMode: MethodArgs<"setFeeSplits">[1];
  };
};

/** Builds a `set_fee_splits` instruction. */
export function setFeeSplits(
  client: AuraClient,
  input: SetFeeSplitsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setFeeSplits(input.args.splits, input.args.lowBalanceMode)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setFeeSplitsInstruction = setFeeSplits;

/** Builds and sends a `set_fee_splits` transaction. */
export async function sendSetFeeSplits(
  client: AuraClient,
  payer: Signer,
  input: SetFeeSplitsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setFeeSplits(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_billing_template` instruction. */
export type UpdateBillingTemplateInput = {
  accounts: MethodAccounts<"updateBillingTemplate">;
  args: MethodArgs<"updateBillingTemplate">[0];
};

/** Builds a `update_billing_template` instruction. */
export function updateBillingTemplate(
  client: AuraClient,
  input: UpdateBillingTemplateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateBillingTemplate(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateBillingTemplateInstruction = updateBillingTemplate;

/** Builds and sends a `update_billing_template` transaction. */
export async function sendUpdateBillingTemplate(
  client: AuraClient,
  payer: Signer,
  input: UpdateBillingTemplateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateBillingTemplate(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_fee_recipient` instruction. */
export type UpdateFeeRecipientInput = {
  accounts: MethodAccounts<"updateFeeRecipient">;
  args: {
    newRecipient: MethodArgs<"updateFeeRecipient">[0];
  };
};

/** Builds a `update_fee_recipient` instruction. */
export function updateFeeRecipient(
  client: AuraClient,
  input: UpdateFeeRecipientInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateFeeRecipient(input.args.newRecipient)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateFeeRecipientInstruction = updateFeeRecipient;

/** Builds and sends a `update_fee_recipient` transaction. */
export async function sendUpdateFeeRecipient(
  client: AuraClient,
  payer: Signer,
  input: UpdateFeeRecipientInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateFeeRecipient(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `update_fee_schedule` instruction. */
export type UpdateFeeScheduleInput = {
  accounts: MethodAccounts<"updateFeeSchedule">;
  args: {
    schedule: MethodArgs<"updateFeeSchedule">[0];
    now: MethodArgs<"updateFeeSchedule">[1];
  };
};

/** Builds a `update_fee_schedule` instruction. */
export function updateFeeSchedule(
  client: AuraClient,
  input: UpdateFeeScheduleInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .updateFeeSchedule(input.args.schedule, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const updateFeeScheduleInstruction = updateFeeSchedule;

/** Builds and sends a `update_fee_schedule` transaction. */
export async function sendUpdateFeeSchedule(
  client: AuraClient,
  payer: Signer,
  input: UpdateFeeScheduleInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await updateFeeSchedule(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `withdraw_unused_fees` instruction. */
export type WithdrawUnusedFeesInput = {
  accounts: MethodAccounts<"withdrawUnusedFees">;
  args: {
    amount: MethodArgs<"withdrawUnusedFees">[0];
  };
};

/** Builds a `withdraw_unused_fees` instruction. */
export function withdrawUnusedFees(
  client: AuraClient,
  input: WithdrawUnusedFeesInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .withdrawUnusedFees(input.args.amount)
    .accountsStrict(input.accounts)
    .instruction();
}

export const withdrawUnusedFeesInstruction = withdrawUnusedFees;

/** Builds and sends a `withdraw_unused_fees` transaction. */
export async function sendWithdrawUnusedFees(
  client: AuraClient,
  payer: Signer,
  input: WithdrawUnusedFeesInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await withdrawUnusedFees(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
