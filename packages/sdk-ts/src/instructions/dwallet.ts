/** Generated instruction builders for the dwallet domain. Do not edit. */

import type {
  SendOptions,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { MethodAccounts, MethodArgs } from "./types.js";

/** Input for the `init_dwallet_state` instruction. */
export type InitDwalletStateInput = {
  accounts: MethodAccounts<"initDwalletState">;
  args: {
    chain: MethodArgs<"initDwalletState">[0];
    now: MethodArgs<"initDwalletState">[1];
  };
};

/** Builds a `init_dwallet_state` instruction. */
export function initDwalletState(
  client: AuraClient,
  input: InitDwalletStateInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .initDwalletState(input.args.chain, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const initDwalletStateInstruction = initDwalletState;

/** Builds and sends a `init_dwallet_state` transaction. */
export async function sendInitDwalletState(
  client: AuraClient,
  payer: Signer,
  input: InitDwalletStateInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await initDwalletState(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `reconcile_dwallet_balance` instruction. */
export type ReconcileDwalletBalanceInput = {
  accounts: MethodAccounts<"reconcileDwalletBalance">;
  args: {
    chain: MethodArgs<"reconcileDwalletBalance">[0];
    now: MethodArgs<"reconcileDwalletBalance">[1];
  };
};

/** Builds a `reconcile_dwallet_balance` instruction. */
export function reconcileDwalletBalance(
  client: AuraClient,
  input: ReconcileDwalletBalanceInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .reconcileDwalletBalance(input.args.chain, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const reconcileDwalletBalanceInstruction = reconcileDwalletBalance;

/** Builds and sends a `reconcile_dwallet_balance` transaction. */
export async function sendReconcileDwalletBalance(
  client: AuraClient,
  payer: Signer,
  input: ReconcileDwalletBalanceInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await reconcileDwalletBalance(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `record_deposit` instruction. */
export type RecordDepositInput = {
  accounts: MethodAccounts<"recordDeposit">;
  args: {
    chain: MethodArgs<"recordDeposit">[0];
    assetId: MethodArgs<"recordDeposit">[1];
    symbol: MethodArgs<"recordDeposit">[2];
    decimals: MethodArgs<"recordDeposit">[3];
    nativeAmount: MethodArgs<"recordDeposit">[4];
    usdValue: MethodArgs<"recordDeposit">[5];
    now: MethodArgs<"recordDeposit">[6];
  };
};

/** Builds a `record_deposit` instruction. */
export function recordDeposit(
  client: AuraClient,
  input: RecordDepositInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .recordDeposit(
      input.args.chain,
      input.args.assetId,
      input.args.symbol,
      input.args.decimals,
      input.args.nativeAmount,
      input.args.usdValue,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const recordDepositInstruction = recordDeposit;

/** Builds and sends a `record_deposit` transaction. */
export async function sendRecordDeposit(
  client: AuraClient,
  payer: Signer,
  input: RecordDepositInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await recordDeposit(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `refresh_asset_balance` instruction. */
export type RefreshAssetBalanceInput = {
  accounts: MethodAccounts<"refreshAssetBalance">;
  args: {
    chain: MethodArgs<"refreshAssetBalance">[0];
    assetId: MethodArgs<"refreshAssetBalance">[1];
    symbol: MethodArgs<"refreshAssetBalance">[2];
    decimals: MethodArgs<"refreshAssetBalance">[3];
    nativeAmount: MethodArgs<"refreshAssetBalance">[4];
    usdValue: MethodArgs<"refreshAssetBalance">[5];
    feed: MethodArgs<"refreshAssetBalance">[6];
    now: MethodArgs<"refreshAssetBalance">[7];
  };
};

/** Builds a `refresh_asset_balance` instruction. */
export function refreshAssetBalance(
  client: AuraClient,
  input: RefreshAssetBalanceInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .refreshAssetBalance(
      input.args.chain,
      input.args.assetId,
      input.args.symbol,
      input.args.decimals,
      input.args.nativeAmount,
      input.args.usdValue,
      input.args.feed,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const refreshAssetBalanceInstruction = refreshAssetBalance;

/** Builds and sends a `refresh_asset_balance` transaction. */
export async function sendRefreshAssetBalance(
  client: AuraClient,
  payer: Signer,
  input: RefreshAssetBalanceInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await refreshAssetBalance(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `refresh_dwallet_balance` instruction. */
export type RefreshDwalletBalanceInput = {
  accounts: MethodAccounts<"refreshDwalletBalance">;
  args: {
    chainCode: MethodArgs<"refreshDwalletBalance">[0];
    now: MethodArgs<"refreshDwalletBalance">[1];
  };
};

/** Builds a `refresh_dwallet_balance` instruction. */
export function refreshDwalletBalance(
  client: AuraClient,
  input: RefreshDwalletBalanceInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .refreshDwalletBalance(input.args.chainCode, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const refreshDwalletBalanceInstruction = refreshDwalletBalance;

/** Builds and sends a `refresh_dwallet_balance` transaction. */
export async function sendRefreshDwalletBalance(
  client: AuraClient,
  payer: Signer,
  input: RefreshDwalletBalanceInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await refreshDwalletBalance(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `refresh_verified_asset_balance` instruction. */
export type RefreshVerifiedAssetBalanceInput = {
  accounts: MethodAccounts<"refreshVerifiedAssetBalance">;
  args: MethodArgs<"refreshVerifiedAssetBalance">[0];
};

/** Builds a `refresh_verified_asset_balance` instruction. */
export function refreshVerifiedAssetBalance(
  client: AuraClient,
  input: RefreshVerifiedAssetBalanceInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .refreshVerifiedAssetBalance(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const refreshVerifiedAssetBalanceInstruction =
  refreshVerifiedAssetBalance;

/** Builds and sends a `refresh_verified_asset_balance` transaction. */
export async function sendRefreshVerifiedAssetBalance(
  client: AuraClient,
  payer: Signer,
  input: RefreshVerifiedAssetBalanceInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await refreshVerifiedAssetBalance(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `register_dwallet` instruction. */
export type RegisterDwalletInput = {
  accounts: MethodAccounts<"registerDwallet">;
  args: MethodArgs<"registerDwallet">[0];
};

/** Builds a `register_dwallet` instruction. */
export function registerDwallet(
  client: AuraClient,
  input: RegisterDwalletInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .registerDwallet(input.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const registerDwalletInstruction = registerDwallet;

/** Builds and sends a `register_dwallet` transaction. */
export async function sendRegisterDwallet(
  client: AuraClient,
  payer: Signer,
  input: RegisterDwalletInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await registerDwallet(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `release_dwallet_spend` instruction. */
export type ReleaseDwalletSpendInput = {
  accounts: MethodAccounts<"releaseDwalletSpend">;
  args: {
    chain: MethodArgs<"releaseDwalletSpend">[0];
    amountUsd: MethodArgs<"releaseDwalletSpend">[1];
    now: MethodArgs<"releaseDwalletSpend">[2];
  };
};

/** Builds a `release_dwallet_spend` instruction. */
export function releaseDwalletSpend(
  client: AuraClient,
  input: ReleaseDwalletSpendInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .releaseDwalletSpend(input.args.chain, input.args.amountUsd, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const releaseDwalletSpendInstruction = releaseDwalletSpend;

/** Builds and sends a `release_dwallet_spend` transaction. */
export async function sendReleaseDwalletSpend(
  client: AuraClient,
  payer: Signer,
  input: ReleaseDwalletSpendInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await releaseDwalletSpend(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `remove_dwallet` instruction. */
export type RemoveDwalletInput = {
  accounts: MethodAccounts<"removeDwallet">;
  args: {
    chain: MethodArgs<"removeDwallet">[0];
    now: MethodArgs<"removeDwallet">[1];
  };
};

/** Builds a `remove_dwallet` instruction. */
export function removeDwallet(
  client: AuraClient,
  input: RemoveDwalletInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .removeDwallet(input.args.chain, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const removeDwalletInstruction = removeDwallet;

/** Builds and sends a `remove_dwallet` transaction. */
export async function sendRemoveDwallet(
  client: AuraClient,
  payer: Signer,
  input: RemoveDwalletInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await removeDwallet(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `reserve_dwallet_spend` instruction. */
export type ReserveDwalletSpendInput = {
  accounts: MethodAccounts<"reserveDwalletSpend">;
  args: {
    chain: MethodArgs<"reserveDwalletSpend">[0];
    amountUsd: MethodArgs<"reserveDwalletSpend">[1];
    now: MethodArgs<"reserveDwalletSpend">[2];
  };
};

/** Builds a `reserve_dwallet_spend` instruction. */
export function reserveDwalletSpend(
  client: AuraClient,
  input: ReserveDwalletSpendInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .reserveDwalletSpend(input.args.chain, input.args.amountUsd, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const reserveDwalletSpendInstruction = reserveDwalletSpend;

/** Builds and sends a `reserve_dwallet_spend` transaction. */
export async function sendReserveDwalletSpend(
  client: AuraClient,
  payer: Signer,
  input: ReserveDwalletSpendInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await reserveDwalletSpend(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `rotate_dwallet_authority` instruction. */
export type RotateDwalletAuthorityInput = {
  accounts: MethodAccounts<"rotateDwalletAuthority">;
  args: {
    chain: MethodArgs<"rotateDwalletAuthority">[0];
    newAuthority: MethodArgs<"rotateDwalletAuthority">[1];
    newCpiAuthoritySeed: MethodArgs<"rotateDwalletAuthority">[2];
    now: MethodArgs<"rotateDwalletAuthority">[3];
  };
};

/** Builds a `rotate_dwallet_authority` instruction. */
export function rotateDwalletAuthority(
  client: AuraClient,
  input: RotateDwalletAuthorityInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .rotateDwalletAuthority(
      input.args.chain,
      input.args.newAuthority,
      input.args.newCpiAuthoritySeed,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const rotateDwalletAuthorityInstruction = rotateDwalletAuthority;

/** Builds and sends a `rotate_dwallet_authority` transaction. */
export async function sendRotateDwalletAuthority(
  client: AuraClient,
  payer: Signer,
  input: RotateDwalletAuthorityInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await rotateDwalletAuthority(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_asset_feed` instruction. */
export type SetAssetFeedInput = {
  accounts: MethodAccounts<"setAssetFeed">;
  args: {
    chain: MethodArgs<"setAssetFeed">[0];
    assetId: MethodArgs<"setAssetFeed">[1];
    feed: MethodArgs<"setAssetFeed">[2];
    now: MethodArgs<"setAssetFeed">[3];
  };
};

/** Builds a `set_asset_feed` instruction. */
export function setAssetFeed(
  client: AuraClient,
  input: SetAssetFeedInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setAssetFeed(
      input.args.chain,
      input.args.assetId,
      input.args.feed,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const setAssetFeedInstruction = setAssetFeed;

/** Builds and sends a `set_asset_feed` transaction. */
export async function sendSetAssetFeed(
  client: AuraClient,
  payer: Signer,
  input: SetAssetFeedInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setAssetFeed(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_asset_oracle_feed` instruction. */
export type SetAssetOracleFeedInput = {
  accounts: MethodAccounts<"setAssetOracleFeed">;
  args: {
    chain: MethodArgs<"setAssetOracleFeed">[0];
    args: MethodArgs<"setAssetOracleFeed">[1];
  };
};

/** Builds a `set_asset_oracle_feed` instruction. */
export function setAssetOracleFeed(
  client: AuraClient,
  input: SetAssetOracleFeedInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setAssetOracleFeed(input.args.chain, input.args.args)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setAssetOracleFeedInstruction = setAssetOracleFeed;

/** Builds and sends a `set_asset_oracle_feed` transaction. */
export async function sendSetAssetOracleFeed(
  client: AuraClient,
  payer: Signer,
  input: SetAssetOracleFeedInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setAssetOracleFeed(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_default_chain` instruction. */
export type SetDefaultChainInput = {
  accounts: MethodAccounts<"setDefaultChain">;
  args: {
    chain: MethodArgs<"setDefaultChain">[0];
    now: MethodArgs<"setDefaultChain">[1];
  };
};

/** Builds a `set_default_chain` instruction. */
export function setDefaultChain(
  client: AuraClient,
  input: SetDefaultChainInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setDefaultChain(input.args.chain, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setDefaultChainInstruction = setDefaultChain;

/** Builds and sends a `set_default_chain` transaction. */
export async function sendSetDefaultChain(
  client: AuraClient,
  payer: Signer,
  input: SetDefaultChainInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setDefaultChain(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_dwallet_label` instruction. */
export type SetDwalletLabelInput = {
  accounts: MethodAccounts<"setDwalletLabel">;
  args: {
    chain: MethodArgs<"setDwalletLabel">[0];
    label: MethodArgs<"setDwalletLabel">[1];
    now: MethodArgs<"setDwalletLabel">[2];
  };
};

/** Builds a `set_dwallet_label` instruction. */
export function setDwalletLabel(
  client: AuraClient,
  input: SetDwalletLabelInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setDwalletLabel(input.args.chain, input.args.label, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setDwalletLabelInstruction = setDwalletLabel;

/** Builds and sends a `set_dwallet_label` transaction. */
export async function sendSetDwalletLabel(
  client: AuraClient,
  payer: Signer,
  input: SetDwalletLabelInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setDwalletLabel(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_dwallet_limits` instruction. */
export type SetDwalletLimitsInput = {
  accounts: MethodAccounts<"setDwalletLimits">;
  args: {
    chain: MethodArgs<"setDwalletLimits">[0];
    dailyLimitUsd: MethodArgs<"setDwalletLimits">[1];
    perTxLimitUsd: MethodArgs<"setDwalletLimits">[2];
    now: MethodArgs<"setDwalletLimits">[3];
  };
};

/** Builds a `set_dwallet_limits` instruction. */
export function setDwalletLimits(
  client: AuraClient,
  input: SetDwalletLimitsInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setDwalletLimits(
      input.args.chain,
      input.args.dailyLimitUsd,
      input.args.perTxLimitUsd,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const setDwalletLimitsInstruction = setDwalletLimits;

/** Builds and sends a `set_dwallet_limits` transaction. */
export async function sendSetDwalletLimits(
  client: AuraClient,
  payer: Signer,
  input: SetDwalletLimitsInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setDwalletLimits(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `set_dwallet_status` instruction. */
export type SetDwalletStatusInput = {
  accounts: MethodAccounts<"setDwalletStatus">;
  args: {
    chain: MethodArgs<"setDwalletStatus">[0];
    statusCode: MethodArgs<"setDwalletStatus">[1];
    now: MethodArgs<"setDwalletStatus">[2];
  };
};

/** Builds a `set_dwallet_status` instruction. */
export function setDwalletStatus(
  client: AuraClient,
  input: SetDwalletStatusInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .setDwalletStatus(input.args.chain, input.args.statusCode, input.args.now)
    .accountsStrict(input.accounts)
    .instruction();
}

export const setDwalletStatusInstruction = setDwalletStatus;

/** Builds and sends a `set_dwallet_status` transaction. */
export async function sendSetDwalletStatus(
  client: AuraClient,
  payer: Signer,
  input: SetDwalletStatusInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await setDwalletStatus(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}

/** Input for the `settle_dwallet_spend` instruction. */
export type SettleDwalletSpendInput = {
  accounts: MethodAccounts<"settleDwalletSpend">;
  args: {
    chain: MethodArgs<"settleDwalletSpend">[0];
    amountUsd: MethodArgs<"settleDwalletSpend">[1];
    assetId: MethodArgs<"settleDwalletSpend">[2];
    nativeAmount: MethodArgs<"settleDwalletSpend">[3];
    now: MethodArgs<"settleDwalletSpend">[4];
  };
};

/** Builds a `settle_dwallet_spend` instruction. */
export function settleDwalletSpend(
  client: AuraClient,
  input: SettleDwalletSpendInput,
): Promise<TransactionInstruction> {
  return client.program.methods
    .settleDwalletSpend(
      input.args.chain,
      input.args.amountUsd,
      input.args.assetId,
      input.args.nativeAmount,
      input.args.now,
    )
    .accountsStrict(input.accounts)
    .instruction();
}

export const settleDwalletSpendInstruction = settleDwalletSpend;

/** Builds and sends a `settle_dwallet_spend` transaction. */
export async function sendSettleDwalletSpend(
  client: AuraClient,
  payer: Signer,
  input: SettleDwalletSpendInput,
  extraSigners: Signer[] = [],
  options?: SendOptions,
): Promise<string> {
  const instruction = await settleDwalletSpend(client, input);
  return await client.sendInstructions(
    payer,
    [instruction],
    extraSigners,
    options,
  );
}
