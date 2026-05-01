/**
 * High-level TypeScript client for the AURA autonomous treasury program.
 *
 * `AuraClient` wraps the core `aura-core` treasury, confidential execution,
 * dWallet, and governance flows with typed account structs, automatic PDA
 * derivation, and early signer validation. Every instruction is available in
 * two forms:
 *
 * - `*Instruction(...)` — returns a `TransactionInstruction` for composing
 *   into your own transaction.
 * - the method without the suffix — builds, signs, and sends in one call,
 *   validating the signer against the expected account before touching RPC.
 *
 * The client is read-only at the provider level; it never holds a private key.
 * Callers pass a `Signer` only when submitting transactions.
 */

import {
  AnchorProvider,
  BorshInstructionCoder,
  Program,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type ConfirmOptions,
  type SendOptions,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";

import type {
  AiAuthorityTreasuryAccounts,
  ApprovePendingExecutionAccounts,
  AttestPolicyAccounts,
  CheckInvariantsAccounts,
  ConfigureBudgetEnvelopeAccounts,
  ConfigureConfidentialGuardrailsAccounts,
  ConfigureConfidentialVectorGuardrailsAccounts,
  ConfirmPolicyDecryptionAccounts,
  ExecutePendingAccounts,
  FinalizeExecutionAccounts,
  GrantOperatorRoleAccounts,
  GuardianTreasuryAccounts,
  InitExposureGroupAccounts,
  InitExternalLivenessAccounts,
  JoinExposureGroupAccounts,
  OwnerTreasuryAccounts,
  ProposeBatchAccounts,
  ProposeTransactionAccounts,
  ProposeConfidentialTransactionAccounts,
  ProposeConfidentialVectorTransactionAccounts,
  RefreshExternalLivenessAccounts,
  RequestPolicyDecryptionAccounts,
  RevokeOperatorRoleAccounts,
  SetScopedPauseAccounts,
  SimulatePolicyAccounts,
  WritePolicyReceiptAccounts,
} from "./accounts.js";
import type { BNish } from "./bn.js";
import { toBN } from "./bn.js";
import {
  AURA_IDL,
  AURA_PROGRAM_ID,
  type ApplyPolicyPresetArgs,
  type ApprovePendingExecutionArgs,
  type AttestPolicyArgs,
  type AuraTypeDefs,
  type CheckInvariantsArgs,
  type ConfigureApprovalLadderArgs,
  type ConfigureBudgetEnvelopeArgs,
  type ConfigureLivenessGuardrailsArgs,
  type ConfigureMultisigArgs,
  type ConfigureSwarmArgs,
  type CreateTreasuryArgs,
  type GrantOperatorRoleArgs,
  type InitExposureGroupArgs,
  type InitExternalLivenessArgs,
  type ProposeConfidentialTransactionArgs,
  type ProposeBatchArgs,
  type ProposeTransactionArgs,
  type RefreshExternalLivenessArgs,
  type RegisterDwalletArgs,
  type SetScopedPauseArgs,
  type SimulatePolicyArgs,
  type TreasuryAccountRecord,
  type WritePolicyReceiptArgs,
} from "./constants.js";
import type { AuraCore } from "./generated/aura_core.js";
import {
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveTreasuryAddress,
} from "./pda.js";

/** Options accepted by the `AuraClient` constructor. */
export interface AuraClientOptions {
  /** Active Solana connection. */
  connection: Connection;
  /**
   * Override the program ID.
   * Defaults to the deployed devnet `AURA_PROGRAM_ID` read from the IDL.
   * Set this when testing against a local validator or a custom deployment.
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
    throw new Error("This AuraClient instance is read-only for provider signing");
  };
  const ephemeral = Keypair.generate();
  return {
    payer: ephemeral,
    publicKey: ephemeral.publicKey,
    signTransaction: throwReadonly,
    signAllTransactions: throwReadonly,
  };
}

/**
 * Asserts that `signer.publicKey` equals `expected`, throwing a descriptive
 * error before any RPC call is made if they differ.
 *
 * This catches account mismatches early and avoids wasting SOL on a
 * transaction that would fail on-chain anyway.
 *
 * @param signer   The signer being passed by the caller.
 * @param expected The public key the program expects for this role.
 * @param role     Human-readable role name used in the error message.
 */
function assertSignerMatches(
  signer: Signer,
  expected: PublicKey,
  role: string,
): void {
  if (!signer.publicKey.equals(expected)) {
    throw new Error(
      `Signer for ${role} must match account ${expected.toBase58()}, got ${signer.publicKey.toBase58()}`,
    );
  }
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
    this.confirmOptions = options.confirmOptions ?? AnchorProvider.defaultOptions();
    this.provider = new AnchorProvider(
      this.connection,
      createReadonlyWallet(),
      this.confirmOptions,
    );
    this.program = new Program<AuraCore>(
      // Spread the IDL and override the address so a custom programId is
      // reflected in every instruction the program builds.
      { ...AURA_IDL, address: this.programId.toBase58() },
      this.provider,
    );
    this.coder = new BorshInstructionCoder(AURA_IDL);
  }

  // PDA helpers

  /**
   * Derives the treasury PDA for `owner` and `agentId` using this client's program ID.
   *
   * @returns `[address, bump]`
   */
  deriveTreasuryAddress(owner: PublicKey, agentId: string): [PublicKey, number] {
    return deriveTreasuryAddress(owner, agentId, this.programId);
  }

  /**
   * Derives AURA's dWallet CPI authority PDA.
   * Pass this as `cpiAuthority` in `execute_pending`.
   *
   * @returns `[address, bump]`
   */
  deriveDwalletCpiAuthority(): [PublicKey, number] {
    return deriveDwalletCpiAuthorityAddress(this.programId);
  }

  /**
   * Derives AURA's Encrypt CPI authority PDA.
   * Pass this as `cpiAuthority` in confidential proposal and decryption instructions.
   *
   * @returns `[address, bump]`
   */
  deriveEncryptCpiAuthority(): [PublicKey, number] {
    return deriveEncryptCpiAuthorityAddress(this.programId);
  }

  /**
   * Derives the Encrypt program's event authority PDA.
   * Pass this as `eventAuthority` in any instruction that emits Encrypt events.
   *
   * @param encryptProgramId The Ika Encrypt program ID.
   * @returns `[address, bump]`
   */
  deriveEncryptEventAuthority(encryptProgramId: PublicKey): [PublicKey, number] {
    return deriveEncryptEventAuthorityAddress(encryptProgramId);
  }

  // Account fetching

  /**
   * Fetches and deserializes a `TreasuryAccount`.
   *
   * @throws if the account does not exist on-chain.
   */
  async getTreasuryAccount(treasury: PublicKey): Promise<TreasuryAccountRecord> {
    return (await this.program.account.treasuryAccount.fetch(
      treasury,
    )) as TreasuryAccountRecord;
  }

  /**
   * Fetches and deserializes a `TreasuryAccount`.
   *
   * @returns the account, or `null` if it does not exist.
   */
  async getTreasuryAccountNullable(
    treasury: PublicKey,
  ): Promise<TreasuryAccountRecord | null> {
    return (await this.program.account.treasuryAccount.fetchNullable(
      treasury,
    )) as TreasuryAccountRecord | null;
  }

  /**
   * Derives the treasury PDA for `owner`/`agentId` and fetches the account in one call.
   *
   * @returns `{ treasury, account }` where `account` is `null` if not yet created.
   */
  async getTreasuryForOwner(
    owner: PublicKey,
    agentId: string,
  ): Promise<{ treasury: PublicKey; account: TreasuryAccountRecord | null }> {
    const [treasury] = this.deriveTreasuryAddress(owner, agentId);
    return {
      treasury,
      account: await this.getTreasuryAccountNullable(treasury),
    };
  }

  // Transaction submission

  /**
   * Builds, signs, and sends a transaction containing `instructions`.
   *
   * Returns the transaction signature immediately after forwarding to the
   * cluster. Does not wait for confirmation — call `connection.confirmTransaction`
   * if you need to assert on-chain state immediately after.
   *
   * @param payer        Fee payer and primary signer.
   * @param instructions One or more instructions to include in the transaction.
   * @param extraSigners Additional signers required by the instructions.
   * @param options      Optional send options (e.g. `skipPreflight`).
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

  // create_treasury

  /**
   * Builds a `create_treasury` instruction.
   *
   * If `input.treasury` is omitted the PDA is derived automatically from
   * `input.owner` and `input.args.agentId`.
   *
   * @returns `{ treasury, instruction }` — the derived PDA and the built instruction.
   */
  async createTreasuryInstruction(input: {
    owner: PublicKey;
    treasury?: PublicKey;
    args: CreateTreasuryArgs;
  }): Promise<{ treasury: PublicKey; instruction: TransactionInstruction }> {
    const treasury =
      input.treasury ?? deriveTreasuryAddress(input.owner, input.args.agentId, this.programId)[0];
    const instruction = await this.program.methods
      .createTreasury(input.args)
      .accountsStrict({
        owner: input.owner,
        treasury,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return { treasury, instruction };
  }

  /**
   * Builds and sends a `create_treasury` transaction.
   *
   * @returns `{ treasury, signature }` — the treasury PDA and the transaction signature.
   */
  async createTreasury(
    payer: Signer,
    args: CreateTreasuryArgs,
  ): Promise<{ treasury: PublicKey; signature: string }> {
    const { treasury, instruction } = await this.createTreasuryInstruction({
      owner: payer.publicKey,
      args,
    });
    const signature = await this.sendInstructions(payer, [instruction]);
    return { treasury, signature };
  }

  // register_dwallet

  /** Builds a `register_dwallet` instruction. */
  async registerDwalletInstruction(
    accounts: OwnerTreasuryAccounts,
    args: RegisterDwalletArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .registerDwallet(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /**
   * Builds and sends a `register_dwallet` transaction.
   * Registers a dWallet reference on the treasury for the given chain.
   * Set `args.dwalletAccount` and `args.authorizedUserPubkey` for live Ika signing.
   */
  async registerDwallet(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: RegisterDwalletArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.registerDwalletInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  // configure_confidential_guardrails

  /**
   * Builds a `configure_confidential_guardrails` instruction.
   * Attaches three scalar `EUint64` ciphertext accounts to the treasury.
   */
  async configureConfidentialGuardrailsInstruction(
    accounts: ConfigureConfidentialGuardrailsAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureConfidentialGuardrails(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_confidential_guardrails` transaction. */
  async configureConfidentialGuardrails(
    owner: Signer,
    accounts: ConfigureConfidentialGuardrailsAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureConfidentialGuardrailsInstruction(accounts, now);
    return await this.sendInstructions(owner, [instruction]);
  }

  // configure_confidential_vector_guardrails

  /**
   * Builds a `configure_confidential_vector_guardrails` instruction.
   * Attaches a single `EUint64Vector` ciphertext encoding all three guardrail
   * values instead of three separate scalar accounts.
   */
  async configureConfidentialVectorGuardrailsInstruction(
    accounts: ConfigureConfidentialVectorGuardrailsAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureConfidentialVectorGuardrails(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_confidential_vector_guardrails` transaction. */
  async configureConfidentialVectorGuardrails(
    owner: Signer,
    accounts: ConfigureConfidentialVectorGuardrailsAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureConfidentialVectorGuardrailsInstruction(accounts, now);
    return await this.sendInstructions(owner, [instruction]);
  }

  // propose_transaction

  /**
   * Builds a `propose_transaction` instruction.
   * Submits a public (non-encrypted) proposal. The policy engine evaluates the
   * configured public policy rules synchronously on-chain.
   */
  async proposeTransactionInstruction(
    accounts: ProposeTransactionAccounts,
    args: ProposeTransactionArgs,
  ): Promise<TransactionInstruction> {
    const resolvedAccounts = {
      sessionKeyAccount: null,
      swarmPool: null,
      addressList: null,
      complianceOracle: null,
      parentTreasury: null,
      budgetEnvelope: null,
      exposureGroup: null,
      ...accounts,
    };
    return await this.program.methods
      .proposeTransaction(args)
      .accountsStrict(resolvedAccounts as any)
      .instruction();
  }

  /** Builds and sends a `propose_transaction` transaction. */
  async proposeTransaction(
    aiAuthority: Signer,
    accounts: ProposeTransactionAccounts,
    args: ProposeTransactionArgs,
  ): Promise<string> {
    assertSignerMatches(aiAuthority, accounts.aiAuthority, "aiAuthority");
    const instruction = await this.proposeTransactionInstruction(accounts, args);
    return await this.sendInstructions(aiAuthority, [instruction]);
  }

  // propose_confidential_transaction

  /**
   * Builds a `propose_confidential_transaction` instruction.
   * Runs the public pre-check rules on-chain and submits the FHE policy graph
   * to the Ika Encrypt network via CPI.
   */
  async proposeConfidentialTransactionInstruction(
    accounts: ProposeConfidentialTransactionAccounts,
    args: ProposeConfidentialTransactionArgs,
  ): Promise<TransactionInstruction> {
    const resolvedAccounts = {
      externalLiveness: null,
      ...accounts,
    };
    return await this.program.methods
      .proposeConfidentialTransaction(args)
      .accountsStrict(resolvedAccounts as any)
      .instruction();
  }

  /**
   * Builds and sends a `propose_confidential_transaction` transaction.
   *
   * @param extraSigners Additional signers required by the Encrypt CPI (e.g. freshly
   *                     created ciphertext accounts that must sign their own creation).
   */
  async proposeConfidentialTransaction(
    aiAuthority: Signer,
    accounts: ProposeConfidentialTransactionAccounts,
    args: ProposeConfidentialTransactionArgs,
    extraSigners: Signer[] = [],
  ): Promise<string> {
    assertSignerMatches(aiAuthority, accounts.aiAuthority, "aiAuthority");
    const instruction = await this.proposeConfidentialTransactionInstruction(accounts, args);
    return await this.sendInstructions(aiAuthority, [instruction], extraSigners);
  }

  // propose_confidential_vector_transaction

  /**
   * Builds a `propose_confidential_vector_transaction` instruction.
   * Uses a single `EUint64Vector` guardrail ciphertext. After each approved
   * transaction the output vector is promoted to become the new guardrail,
   * rotating the encrypted state forward automatically.
   */
  async proposeConfidentialVectorTransactionInstruction(
    accounts: ProposeConfidentialVectorTransactionAccounts,
    args: ProposeConfidentialTransactionArgs,
  ): Promise<TransactionInstruction> {
    const resolvedAccounts = {
      externalLiveness: null,
      ...accounts,
    };
    return await this.program.methods
      .proposeConfidentialVectorTransaction(args)
      .accountsStrict(resolvedAccounts as any)
      .instruction();
  }

  /**
   * Builds and sends a `propose_confidential_vector_transaction` transaction.
   *
   * @param extraSigners Additional signers required by the Encrypt CPI.
   */
  async proposeConfidentialVectorTransaction(
    aiAuthority: Signer,
    accounts: ProposeConfidentialVectorTransactionAccounts,
    args: ProposeConfidentialTransactionArgs,
    extraSigners: Signer[] = [],
  ): Promise<string> {
    assertSignerMatches(aiAuthority, accounts.aiAuthority, "aiAuthority");
    const instruction = await this.proposeConfidentialVectorTransactionInstruction(accounts, args);
    return await this.sendInstructions(aiAuthority, [instruction], extraSigners);
  }

  // execute_pending

  /**
   * Builds an `execute_pending` instruction.
   * Submits an `approve_message` CPI to the Ika dWallet program once the
   * policy engine has approved the pending proposal.
   */
  async executePendingInstruction(
    accounts: ExecutePendingAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    const resolvedAccounts = {
      messageApproval: null,
      dwalletCoordinator: null,
      dwallet: null,
      cpiAuthority: null,
      dwalletProgram: null,
      externalLiveness: null,
      ...accounts,
    };
    return await this.program.methods
      .executePending(toBN(now))
      .accountsStrict(resolvedAccounts as any)
      .instruction();
  }

  /** Builds and sends an `execute_pending` transaction. */
  async executePending(
    operator: Signer,
    accounts: ExecutePendingAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.executePendingInstruction(accounts, now);
    return await this.sendInstructions(operator, [instruction]);
  }

  // request_policy_decryption

  /**
   * Builds a `request_policy_decryption` instruction.
   * Submits a decryption request to the Ika Encrypt network for the policy
   * output ciphertext produced during a confidential proposal.
   */
  async requestPolicyDecryptionInstruction(
    accounts: RequestPolicyDecryptionAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .requestPolicyDecryption(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /**
   * Builds and sends a `request_policy_decryption` transaction.
   *
   * @param extraSigners Additional signers required by the Encrypt CPI.
   */
  async requestPolicyDecryption(
    operator: Signer,
    accounts: RequestPolicyDecryptionAccounts,
    now: BNish,
    extraSigners: Signer[] = [],
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.requestPolicyDecryptionInstruction(accounts, now);
    return await this.sendInstructions(operator, [instruction], extraSigners);
  }

  // confirm_policy_decryption

  /**
   * Builds a `confirm_policy_decryption` instruction.
   * Reads the decrypted violation code from the request account, applies the
   * policy decision to the pending proposal, and advances the proposal state.
   */
  async confirmPolicyDecryptionInstruction(
    accounts: ConfirmPolicyDecryptionAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .confirmPolicyDecryption(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `confirm_policy_decryption` transaction. */
  async confirmPolicyDecryption(
    operator: Signer,
    accounts: ConfirmPolicyDecryptionAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.confirmPolicyDecryptionInstruction(accounts, now);
    return await this.sendInstructions(operator, [instruction]);
  }

  // finalize_execution

  /**
   * Builds a `finalize_execution` instruction.
   * Verifies the dWallet co-signature returned by the Ika network and closes
   * the proposal, incrementing the treasury's total transaction counter.
   */
  async finalizeExecutionInstruction(
    accounts: FinalizeExecutionAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    const resolvedAccounts = {
      swarmPool: null,
      budgetEnvelope: null,
      exposureGroup: null,
      externalLiveness: null,
      ...accounts,
    };
    return await this.program.methods
      .finalizeExecution(toBN(now))
      .accountsStrict(resolvedAccounts as any)
      .instruction();
  }

  /** Builds and sends a `finalize_execution` transaction. */
  async finalizeExecution(
    operator: Signer,
    accounts: FinalizeExecutionAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.finalizeExecutionInstruction(accounts, now);
    return await this.sendInstructions(operator, [instruction]);
  }

  // pause_execution

  /**
   * Builds a `pause_execution` instruction.
   *
   * @param paused `true` to block new proposals and executions; `false` to resume.
   */
  async pauseExecutionInstruction(
    accounts: OwnerTreasuryAccounts,
    paused: boolean,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .pauseExecution(paused, toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /**
   * Builds and sends a `pause_execution` transaction.
   *
   * @param paused `true` to pause, `false` to resume.
   */
  async pauseExecution(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    paused: boolean,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.pauseExecutionInstruction(accounts, paused, now);
    return await this.sendInstructions(owner, [instruction]);
  }

  // cancel_pending

  /** Builds a `cancel_pending` instruction. Removes the current pending proposal. */
  async cancelPendingInstruction(
    accounts: OwnerTreasuryAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .cancelPending(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `cancel_pending` transaction. */
  async cancelPending(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.cancelPendingInstruction(accounts, now);
    return await this.sendInstructions(owner, [instruction]);
  }

  // configure_multisig

  /** Builds a `configure_multisig` instruction. */
  async configureMultisigInstruction(
    accounts: OwnerTreasuryAccounts,
    args: ConfigureMultisigArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureMultisig(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_multisig` transaction. */
  async configureMultisig(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: ConfigureMultisigArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureMultisigInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  // propose_override

  /** Builds a `propose_override` instruction. */
  async proposeOverrideInstruction(
    accounts: GuardianTreasuryAccounts,
    newDailyLimitUsd: BNish,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .proposeOverride(toBN(newDailyLimitUsd), toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `propose_override` transaction. */
  async proposeOverride(
    guardian: Signer,
    accounts: GuardianTreasuryAccounts,
    newDailyLimitUsd: BNish,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(guardian, accounts.guardian, "guardian");
    const instruction = await this.proposeOverrideInstruction(accounts, newDailyLimitUsd, now);
    return await this.sendInstructions(guardian, [instruction]);
  }

  // collect_override_signature

  /** Builds a `collect_override_signature` instruction. */
  async collectOverrideSignatureInstruction(
    accounts: GuardianTreasuryAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .collectOverrideSignature(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `collect_override_signature` transaction. */
  async collectOverrideSignature(
    guardian: Signer,
    accounts: GuardianTreasuryAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(guardian, accounts.guardian, "guardian");
    const instruction = await this.collectOverrideSignatureInstruction(accounts, now);
    return await this.sendInstructions(guardian, [instruction]);
  }

  // configure_swarm

  /** Builds a `configure_swarm` instruction. */
  async configureSwarmInstruction(
    accounts: OwnerTreasuryAccounts,
    args: ConfigureSwarmArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureSwarm(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_swarm` transaction. */
  async configureSwarm(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: ConfigureSwarmArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureSwarmInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  // Policy controls

  /** Builds a `simulate_policy` instruction. */
  async simulatePolicyInstruction(
    accounts: SimulatePolicyAccounts,
    args: SimulatePolicyArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .simulatePolicy(args)
      .accountsStrict({
        ...accounts,
        operatorRole: accounts.operatorRole ?? null,
      })
      .instruction();
  }

  /** Builds and sends a `simulate_policy` transaction. */
  async simulatePolicy(
    payer: Signer,
    accounts: SimulatePolicyAccounts,
    args: SimulatePolicyArgs,
  ): Promise<string> {
    assertSignerMatches(payer, accounts.payer, "payer");
    const instruction = await this.simulatePolicyInstruction(accounts, args);
    return await this.sendInstructions(payer, [instruction]);
  }

  /** Builds a `write_policy_receipt` instruction. */
  async writePolicyReceiptInstruction(
    accounts: WritePolicyReceiptAccounts,
    args: WritePolicyReceiptArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .writePolicyReceipt(args)
      .accountsStrict({
        ...accounts,
        attestation: accounts.attestation ?? null,
      })
      .instruction();
  }

  /** Builds and sends a `write_policy_receipt` transaction. */
  async writePolicyReceipt(
    payer: Signer,
    accounts: WritePolicyReceiptAccounts,
    args: WritePolicyReceiptArgs,
  ): Promise<string> {
    assertSignerMatches(payer, accounts.payer, "payer");
    const instruction = await this.writePolicyReceiptInstruction(accounts, args);
    return await this.sendInstructions(payer, [instruction]);
  }

  /** Builds an `apply_policy_preset` instruction. */
  async applyPolicyPresetInstruction(
    accounts: OwnerTreasuryAccounts,
    args: ApplyPolicyPresetArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.applyPolicyPreset(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends an `apply_policy_preset` transaction. */
  async applyPolicyPreset(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: ApplyPolicyPresetArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.applyPolicyPresetInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds a `configure_budget_envelope` instruction. */
  async configureBudgetEnvelopeInstruction(
    accounts: ConfigureBudgetEnvelopeAccounts,
    args: ConfigureBudgetEnvelopeArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureBudgetEnvelope(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_budget_envelope` transaction. */
  async configureBudgetEnvelope(
    owner: Signer,
    accounts: ConfigureBudgetEnvelopeAccounts,
    args: ConfigureBudgetEnvelopeArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureBudgetEnvelopeInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds an `init_exposure_group` instruction. */
  async initExposureGroupInstruction(
    accounts: InitExposureGroupAccounts,
    args: InitExposureGroupArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.initExposureGroup(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends an `init_exposure_group` transaction. */
  async initExposureGroup(
    authority: Signer,
    accounts: InitExposureGroupAccounts,
    args: InitExposureGroupArgs,
  ): Promise<string> {
    assertSignerMatches(authority, accounts.authority, "authority");
    const instruction = await this.initExposureGroupInstruction(accounts, args);
    return await this.sendInstructions(authority, [instruction]);
  }

  /** Builds a `join_exposure_group` instruction. */
  async joinExposureGroupInstruction(
    accounts: JoinExposureGroupAccounts,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.joinExposureGroup().accountsStrict(accounts).instruction();
  }

  /** Builds and sends a `join_exposure_group` transaction. */
  async joinExposureGroup(
    authority: Signer,
    accounts: JoinExposureGroupAccounts,
  ): Promise<string> {
    assertSignerMatches(authority, accounts.authority, "authority");
    const instruction = await this.joinExposureGroupInstruction(accounts);
    return await this.sendInstructions(authority, [instruction]);
  }

  /** Builds a `configure_approval_ladder` instruction. */
  async configureApprovalLadderInstruction(
    accounts: OwnerTreasuryAccounts,
    args: ConfigureApprovalLadderArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureApprovalLadder(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_approval_ladder` transaction. */
  async configureApprovalLadder(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: ConfigureApprovalLadderArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureApprovalLadderInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds an `approve_pending_execution` instruction. */
  async approvePendingExecutionInstruction(
    accounts: ApprovePendingExecutionAccounts,
    args: ApprovePendingExecutionArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .approvePendingExecution(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends an `approve_pending_execution` transaction. */
  async approvePendingExecution(
    approver: Signer,
    accounts: ApprovePendingExecutionAccounts,
    args: ApprovePendingExecutionArgs,
  ): Promise<string> {
    assertSignerMatches(approver, accounts.approver, "approver");
    const instruction = await this.approvePendingExecutionInstruction(accounts, args);
    return await this.sendInstructions(approver, [instruction]);
  }

  /** Builds a `set_scoped_pause` instruction. */
  async setScopedPauseInstruction(
    accounts: SetScopedPauseAccounts,
    args: SetScopedPauseArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .setScopedPause(args)
      .accountsStrict({
        ...accounts,
        operatorRole: accounts.operatorRole ?? null,
      })
      .instruction();
  }

  /** Builds and sends a `set_scoped_pause` transaction. */
  async setScopedPause(
    operator: Signer,
    accounts: SetScopedPauseAccounts,
    args: SetScopedPauseArgs,
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.setScopedPauseInstruction(accounts, args);
    return await this.sendInstructions(operator, [instruction]);
  }

  /** Builds a `grant_operator_role` instruction. */
  async grantOperatorRoleInstruction(
    accounts: GrantOperatorRoleAccounts,
    args: GrantOperatorRoleArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.grantOperatorRole(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends a `grant_operator_role` transaction. */
  async grantOperatorRole(
    owner: Signer,
    accounts: GrantOperatorRoleAccounts,
    args: GrantOperatorRoleArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.grantOperatorRoleInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds a `revoke_operator_role` instruction. */
  async revokeOperatorRoleInstruction(
    accounts: RevokeOperatorRoleAccounts,
    now: BNish,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .revokeOperatorRole(toBN(now))
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `revoke_operator_role` transaction. */
  async revokeOperatorRole(
    owner: Signer,
    accounts: RevokeOperatorRoleAccounts,
    now: BNish,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.revokeOperatorRoleInstruction(accounts, now);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds an `init_external_liveness` instruction. */
  async initExternalLivenessInstruction(
    accounts: InitExternalLivenessAccounts,
    args: InitExternalLivenessArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .initExternalLiveness(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends an `init_external_liveness` transaction. */
  async initExternalLiveness(
    owner: Signer,
    accounts: InitExternalLivenessAccounts,
    args: InitExternalLivenessArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.initExternalLivenessInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds a `configure_liveness_guardrails` instruction. */
  async configureLivenessGuardrailsInstruction(
    accounts: OwnerTreasuryAccounts,
    args: ConfigureLivenessGuardrailsArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .configureLivenessGuardrails(args)
      .accountsStrict(accounts)
      .instruction();
  }

  /** Builds and sends a `configure_liveness_guardrails` transaction. */
  async configureLivenessGuardrails(
    owner: Signer,
    accounts: OwnerTreasuryAccounts,
    args: ConfigureLivenessGuardrailsArgs,
  ): Promise<string> {
    assertSignerMatches(owner, accounts.owner, "owner");
    const instruction = await this.configureLivenessGuardrailsInstruction(accounts, args);
    return await this.sendInstructions(owner, [instruction]);
  }

  /** Builds a `refresh_external_liveness` instruction. */
  async refreshExternalLivenessInstruction(
    accounts: RefreshExternalLivenessAccounts,
    args: RefreshExternalLivenessArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .refreshExternalLiveness(args)
      .accountsStrict({
        ...accounts,
        operatorRole: accounts.operatorRole ?? null,
      })
      .instruction();
  }

  /** Builds and sends a `refresh_external_liveness` transaction. */
  async refreshExternalLiveness(
    operator: Signer,
    accounts: RefreshExternalLivenessAccounts,
    args: RefreshExternalLivenessArgs,
  ): Promise<string> {
    assertSignerMatches(operator, accounts.operator, "operator");
    const instruction = await this.refreshExternalLivenessInstruction(accounts, args);
    return await this.sendInstructions(operator, [instruction]);
  }

  /** Builds an `attest_policy` instruction. */
  async attestPolicyInstruction(
    accounts: AttestPolicyAccounts,
    args: AttestPolicyArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.attestPolicy(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends an `attest_policy` transaction. */
  async attestPolicy(
    payer: Signer,
    attester: Signer,
    accounts: AttestPolicyAccounts,
    args: AttestPolicyArgs,
  ): Promise<string> {
    assertSignerMatches(payer, accounts.payer, "payer");
    assertSignerMatches(attester, accounts.attester, "attester");
    const instruction = await this.attestPolicyInstruction(accounts, args);
    const extraSigners = attester.publicKey.equals(payer.publicKey) ? [] : [attester];
    return await this.sendInstructions(payer, [instruction], extraSigners);
  }

  /** Builds a `propose_batch` instruction. */
  async proposeBatchInstruction(
    accounts: ProposeBatchAccounts,
    args: ProposeBatchArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.proposeBatch(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends a `propose_batch` transaction. */
  async proposeBatch(
    payer: Signer,
    accounts: ProposeBatchAccounts,
    args: ProposeBatchArgs,
  ): Promise<string> {
    assertSignerMatches(payer, accounts.payer, "payer");
    const instruction = await this.proposeBatchInstruction(accounts, args);
    return await this.sendInstructions(payer, [instruction]);
  }

  /** Builds a `check_invariants` instruction. */
  async checkInvariantsInstruction(
    accounts: CheckInvariantsAccounts,
    args: CheckInvariantsArgs,
  ): Promise<TransactionInstruction> {
    return await this.program.methods.checkInvariants(args).accountsStrict(accounts).instruction();
  }

  /** Builds and sends a `check_invariants` transaction. */
  async checkInvariants(
    payer: Signer,
    accounts: CheckInvariantsAccounts,
    args: CheckInvariantsArgs,
  ): Promise<string> {
    assertSignerMatches(payer, accounts.payer, "payer");
    const instruction = await this.checkInvariantsInstruction(accounts, args);
    return await this.sendInstructions(payer, [instruction]);
  }
}

// Re-export so consumers can reference the full set of IDL-derived types
// through a single import from this module if preferred.
export type { AuraTypeDefs };
