import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ExtensionType,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  type Keypair,
  type PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { connection, getPayer, logTransaction } from "../devnet.js";
import {
  type LiveTokenAsset,
  rawAmountToUi,
  readTokenBalance,
  type TokenBalanceSnapshot,
  tokenAta,
  uiAmountToRaw,
} from "./assets.js";
import {
  BOOTSTRAP_SOURCE_UI,
  DEFAULT_TRANSFER_UI,
  MIN_DWALLET_FEE_LAMPORTS,
} from "./config.js";

async function pollConfirmed(
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const conn = connection();
  for (;;) {
    const { value } = await conn.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      throw new Error(`tx ${signature} failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new Error(`tx ${signature} expired`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

export async function sendLiveIxs(
  ixs: TransactionInstruction[],
  label: string,
  extraSigners: Keypair[] = [],
): Promise<string> {
  const payer = getPayer();
  const conn = connection();
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...ixs,
  );
  tx.sign(payer, ...extraSigners);
  const simulation = await conn.simulateTransaction(tx, [
    payer,
    ...extraSigners,
  ]);
  if (simulation.value.err) {
    throw new Error(
      [
        `${label} simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ...(simulation.value.logs ?? []),
      ].join("\n"),
    );
  }
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await pollConfirmed(signature, lastValidBlockHeight);
  logTransaction(label, signature);
  return signature;
}

export async function assertSimulationPasses(
  tx: Transaction,
  label: string,
): Promise<void> {
  const simulation = await connection().simulateTransaction(tx);
  if (simulation.value.err) {
    throw new Error(
      [
        `${label} simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ...(simulation.value.logs ?? []),
      ].join("\n"),
    );
  }
}

export async function ensureTokenAccount(params: {
  owner: PublicKey;
  ata: PublicKey;
  mint: PublicKey;
  tokenProgramId: PublicKey;
  label: string;
}): Promise<void> {
  const { owner, ata, mint, tokenProgramId, label } = params;
  if (await connection().getAccountInfo(ata, "confirmed")) return;
  await sendLiveIxs(
    [
      createAssociatedTokenAccountInstruction(
        getPayer().publicKey,
        ata,
        owner,
        mint,
        tokenProgramId,
      ),
    ],
    `create ${label} ATA`,
  );
}

export async function createLiveTransferInstruction(params: {
  asset: LiveTokenAsset;
  source: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  amountRaw: bigint;
}): Promise<TransactionInstruction> {
  const { asset, source, destination, owner, amountRaw } = params;
  if (asset.extensionTypes.includes(ExtensionType.TransferHook)) {
    return createTransferCheckedWithTransferHookInstruction(
      connection(),
      source,
      asset.mint,
      destination,
      owner,
      amountRaw,
      asset.decimals,
      [],
      "confirmed",
      asset.tokenProgramId,
    );
  }
  return createTransferCheckedInstruction(
    source,
    asset.mint,
    destination,
    owner,
    amountRaw,
    asset.decimals,
    [],
    asset.tokenProgramId,
  );
}

export async function ensureDwalletFeePayerLamports(
  dwalletSolanaKey: PublicKey,
): Promise<void> {
  const balance = await connection().getBalance(dwalletSolanaKey, "confirmed");
  if (balance >= MIN_DWALLET_FEE_LAMPORTS) return;
  await sendLiveIxs(
    [
      SystemProgram.transfer({
        fromPubkey: getPayer().publicKey,
        toPubkey: dwalletSolanaKey,
        lamports: MIN_DWALLET_FEE_LAMPORTS - balance,
      }),
    ],
    "fund dWallet fee payer",
  );
}

export async function transferFromPayer(params: {
  asset: LiveTokenAsset;
  destinationOwner: PublicKey;
  amountRaw: bigint;
  label: string;
}): Promise<{
  signature: string;
  destinationAta: PublicKey;
  beforeSource: bigint;
  afterSource: bigint;
  beforeDestination: bigint;
  afterDestination: bigint;
}> {
  const { asset, destinationOwner, amountRaw, label } = params;
  const payer = getPayer();
  const destinationAta = tokenAta(
    asset.mint,
    destinationOwner,
    asset.tokenProgramId,
  );
  await ensureTokenAccount({
    owner: destinationOwner,
    ata: destinationAta,
    mint: asset.mint,
    tokenProgramId: asset.tokenProgramId,
    label,
  });
  const beforeSource = await readTokenBalance(
    asset.payerTokenAccount,
    asset.tokenProgramId,
  );
  const beforeDestination = await readTokenBalance(
    destinationAta,
    asset.tokenProgramId,
  );
  const ix = await createLiveTransferInstruction({
    asset,
    source: asset.payerTokenAccount,
    destination: destinationAta,
    owner: payer.publicKey,
    amountRaw,
  });
  const signature = await sendLiveIxs([ix], label);
  const afterSource = await readTokenBalance(
    asset.payerTokenAccount,
    asset.tokenProgramId,
  );
  const afterDestination = await readTokenBalance(
    destinationAta,
    asset.tokenProgramId,
  );
  return {
    signature,
    destinationAta,
    beforeSource: beforeSource.amount,
    afterSource: afterSource.amount,
    beforeDestination: beforeDestination.amount,
    afterDestination: afterDestination.amount,
  };
}

export async function bootstrapDwalletSourceIfNeeded(params: {
  asset: LiveTokenAsset;
  sourceAta: PublicKey;
  sourceOwner: PublicKey;
}): Promise<{ source: TokenBalanceSnapshot }> {
  const { asset, sourceAta, sourceOwner } = params;
  const beforeSource = await readTokenBalance(sourceAta, asset.tokenProgramId);
  const oneUnit = uiAmountToRaw(DEFAULT_TRANSFER_UI, asset.decimals);
  if (beforeSource.amount > oneUnit) return { source: beforeSource };

  const payerBalance = await readTokenBalance(
    asset.payerTokenAccount,
    asset.tokenProgramId,
  );
  const bootstrapRaw = uiAmountToRaw(BOOTSTRAP_SOURCE_UI, asset.decimals);
  const topUpRaw = bootstrapRaw - beforeSource.amount;
  if (payerBalance.amount < topUpRaw) {
    throw new Error(
      [
        "cached dWallet source ATA has no funded test token balance",
        `mint          : ${asset.mint.toBase58()}`,
        `dWallet owner : ${sourceOwner.toBase58()}`,
        `source ATA    : ${sourceAta.toBase58()}`,
        `payer owner   : ${getPayer().publicKey.toBase58()}`,
        `payer ATA     : ${asset.payerTokenAccount.toBase58()}`,
        `payer ATA bal : ${payerBalance.uiAmountString}`,
        `need payer ATA >= ${rawAmountToUi(topUpRaw, asset.decimals)} to bootstrap dWallet source`,
      ].join("\n"),
    );
  }

  console.log("\n=== live scenario dWallet funding ===");
  console.log(`payer ATA       : ${asset.payerTokenAccount.toBase58()}`);
  console.log(`dWallet ATA     : ${sourceAta.toBase58()}`);
  console.log(`bootstrap amount: ${rawAmountToUi(topUpRaw, asset.decimals)}`);

  await sendLiveIxs(
    [
      await createLiveTransferInstruction({
        asset,
        source: asset.payerTokenAccount,
        destination: sourceAta,
        owner: getPayer().publicKey,
        amountRaw: topUpRaw,
      }),
    ],
    "bootstrap dWallet token source",
  );

  return { source: await readTokenBalance(sourceAta, asset.tokenProgramId) };
}
