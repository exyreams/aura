/**
 * Core client for the AURA autonomous treasury program.
 *
 * `AuraClient` manages Solana connection state, Anchor provider/program
 * bindings, and transaction serialization/sending.
 */

import {
  AnchorProvider,
  BorshInstructionCoder,
  Program,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  type ConfirmOptions,
  type Connection,
  Keypair,
  type PublicKey,
  type SendOptions,
  type Signer,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import { AURA_IDL, AURA_PROGRAM_ID } from "./constants.js";
import type { AuraCore } from "./generated/aura_core.js";

/** Options accepted by the `AuraClient` constructor. */
export interface AuraClientOptions {
  /** Active Solana connection. */
  connection: Connection;
  /**
   * Override the program ID.
   * Defaults to the deployed devnet `AURA_PROGRAM_ID` read from the IDL.
   */
  programId?: PublicKey;
  /** Anchor confirm options forwarded to the underlying provider. */
  confirmOptions?: ConfirmOptions;
}

/**
 * Creates a throwaway wallet that satisfies the Anchor provider interface
 * without holding any real signing authority. The client never uses this
 * wallet to sign — callers always pass an explicit `Signer`.
 */
function createReadonlyWallet(): Wallet {
  const throwReadonly = async <T>(_: T): Promise<T> => {
    throw new Error(
      "This AuraClient instance is read-only for provider signing",
    );
  };
  const ephemeral = Keypair.generate();
  return {
    payer: ephemeral,
    publicKey: ephemeral.publicKey,
    signTransaction: throwReadonly,
    signAllTransactions: throwReadonly,
  };
}

/** The AURA TypeScript SDK client. */
export class AuraClient {
  /** Active Solana connection used for all RPC calls. */
  readonly connection: Connection;
  /** The program ID this client targets. */
  readonly programId: PublicKey;
  /** Confirm options forwarded to the Anchor provider and `sendRawTransaction`. */
  readonly confirmOptions: ConfirmOptions;
  /** Anchor provider — read-only; never used to sign transactions. */
  readonly provider: AnchorProvider;
  /** Anchor-generated program instance used to build typed instructions. */
  readonly program: Program<AuraCore>;
  /** Borsh instruction coder — useful for decoding raw instruction data in tests. */
  readonly coder: BorshInstructionCoder;

  constructor(options: AuraClientOptions) {
    this.connection = options.connection;
    this.programId = options.programId ?? AURA_PROGRAM_ID;
    this.confirmOptions =
      options.confirmOptions ?? AnchorProvider.defaultOptions();
    this.provider = new AnchorProvider(
      this.connection,
      createReadonlyWallet(),
      this.confirmOptions,
    );
    this.program = new Program<AuraCore>(
      { ...AURA_IDL, address: this.programId.toBase58() },
      this.provider,
    );
    this.coder = new BorshInstructionCoder(AURA_IDL);
  }

  /**
   * Builds, signs, and sends a transaction containing `instructions`.
   */
  async sendInstructions(
    payer: Signer,
    instructions: TransactionInstruction[],
    extraSigners: Signer[] = [],
    options?: SendOptions,
  ): Promise<string> {
    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash(
      options?.preflightCommitment ?? this.confirmOptions.preflightCommitment,
    );
    tx.recentBlockhash = blockhash;
    tx.sign(payer, ...extraSigners);
    return await this.connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: this.confirmOptions.preflightCommitment,
      ...options,
    });
  }

  /**
   * Builds, signs, and sends a transaction containing a single instruction.
   */
  async sendInstruction(
    payer: Signer,
    instruction: TransactionInstruction,
    extraSigners: Signer[] = [],
    options?: SendOptions,
  ): Promise<string> {
    return await this.sendInstructions(
      payer,
      [instruction],
      extraSigners,
      options,
    );
  }
}
