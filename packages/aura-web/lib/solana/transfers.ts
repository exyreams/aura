import {
  type Connection,
  type PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export interface NativeSolTransferDraft {
  transaction: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  feeLamports: number | null;
}

export async function createNativeSolTransferDraft(params: {
  connection: Connection;
  fromPubkey: PublicKey;
  toPubkey: PublicKey;
  lamports: bigint;
}): Promise<NativeSolTransferDraft> {
  const { connection, fromPubkey, toPubkey, lamports } = params;
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: latest.blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
      }),
    ],
  }).compileToV0Message();
  const fee = await connection.getFeeForMessage(message, "confirmed");

  return {
    transaction: new VersionedTransaction(message),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    feeLamports: fee.value,
  };
}

export async function simulateTransferDraft(
  connection: Connection,
  transaction: VersionedTransaction,
) {
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  });

  if (simulation.value.err) {
    throw new Error(
      [
        `Preflight simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ...(simulation.value.logs ?? []),
      ].join("\n"),
    );
  }

  return simulation;
}
