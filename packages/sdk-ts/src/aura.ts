/**
 * High-level facade for the AURA SDK.
 *
 * `Aura` wraps `AuraClient` with sensible defaults, automatic timestamp
 * injection, plain-number inputs (no `BN` required), and chainable namespaces.
 *
 * This is the recommended API for most developers. Advanced users who need
 * full control over every parameter should use `AuraClient` directly.
 *
 * @example
 * ```typescript
 * import { Aura } from "@aura/sdk-ts";
 * import { Keypair } from "@solana/web3.js";
 *
 * const aura = new Aura({
 *   rpcUrl: "https://api.devnet.solana.com",
 *   keypair: Keypair.fromSecretKey(secretKey),
 * });
 *
 * // Create a treasury with sensible defaults
 * const { treasury } = await aura.treasury.create({
 *   agentId: "my-agent",
 *   dailyLimitUsd: 10_000,
 *   perTxLimitUsd: 1_000,
 * });
 *
 * // Propose a transaction (timestamps injected automatically)
 * await aura.treasury.propose({
 *   treasury,
 *   amountUsd: 250,
 *   chain: "ethereum",
 *   recipient: "0xdeadbeef...",
 * });
 * ```
 */

import BN from "bn.js";
import {
  Connection,
  type Keypair,
  type PublicKey,
  type Signer,
} from "@solana/web3.js";

import { AuraClient, type AuraClientOptions } from "./client.js";
import { toBN } from "./bn.js";
import type {
  ConfigureMultisigArgs,
  ConfigureSwarmArgs,
  CreateTreasuryArgs,
  ProposeTransactionArgs,
  RegisterDwalletArgs,
} from "./constants.js";

/** Options for the high-level `Aura` facade. */
export interface AuraOptions {
  /** Solana RPC URL. */
  rpcUrl: string;
  /**
   * Default keypair used as the signer for all transactions.
   * Can be overridden per-method by passing an explicit `signer` option.
   */
  keypair: Keypair;
  /** Override the program ID (defaults to devnet). */
  programId?: PublicKey;
}

/** Simplified options for creating a treasury. */
export interface CreateTreasuryOptions {
  /** Unique agent identifier. */
  agentId: string;
  /** AI agent's signing key (defaults to the configured keypair). */
  aiAuthority?: PublicKey;
  /** Daily spending limit in USD cents. */
  dailyLimitUsd: number;
  /** Per-transaction spending limit in USD cents. */
  perTxLimitUsd: number;
  /** Daytime hourly limit in USD cents (defaults to dailyLimitUsd / 10). */
  daytimeHourlyLimitUsd?: number;
  /** Nighttime hourly limit in USD cents (defaults to dailyLimitUsd / 20). */
  nighttimeHourlyLimitUsd?: number;
  /** Velocity limit in USD cents (defaults to dailyLimitUsd / 2). */
  velocityLimitUsd?: number;
  /** Allowed protocol bitmap (defaults to 31 = all protocols). */
  allowedProtocolBitmap?: number;
  /** Max slippage in basis points (defaults to 100 = 1%). */
  maxSlippageBps?: number;
  /** Max quote age in seconds (defaults to 300 = 5 minutes). */
  maxQuoteAgeSecs?: number;
  /** Max counterparty risk score 0-100 (defaults to 70). */
  maxCounterpartyRiskScore?: number;
  /** Bitcoin manual review threshold in USD cents (defaults to 5000). */
  bitcoinManualReviewThresholdUsd?: number;
  /** Pending transaction TTL in seconds (defaults to 900 = 15 minutes). */
  pendingTransactionTtlSecs?: number;
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/** Simplified options for registering a dWallet. */
export interface RegisterDwalletOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** Chain: 0=Solana 1=Bitcoin 2=Ethereum 3=Polygon 4=Arbitrum 5=Optimism. */
  chain: number;
  /** Unique dWallet identifier from Ika. */
  dwalletId: string;
  /** Native address on the target chain (e.g. `0x...` for EVM). */
  address: string;
  /** Current balance in USD cents. */
  balanceUsd: number;
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/** Simplified options for proposing a transaction. */
export interface ProposeTransactionOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** Transaction amount in USD cents. */
  amountUsd: number;
  /** Target chain: 0=Solana 1=Bitcoin 2=Ethereum 3=Polygon 4=Arbitrum 5=Optimism. */
  chain: number;
  /** Transaction type: 0=Transfer 1=Swap 2=Lending etc. */
  txType?: number;
  /** Recipient address or contract on the target chain. */
  recipient: string;
  /** Protocol ID for DeFi whitelisting (optional). */
  protocolId?: number;
  /** Expected output amount for slippage checks (optional). */
  expectedOutputUsd?: number;
  /** Actual output amount for slippage checks (optional). */
  actualOutputUsd?: number;
  /** Quote age in seconds for freshness checks (optional). */
  quoteAgeSecs?: number;
  /** Counterparty risk score 0-100 (optional). */
  counterpartyRiskScore?: number;
  /** Override the AI authority (defaults to the configured keypair). */
  aiAuthority?: Signer;
}

/** Simplified options for pausing/unpausing execution. */
export interface PauseExecutionOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** `true` to pause, `false` to unpause. */
  paused: boolean;
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/** Simplified options for canceling a pending transaction. */
export interface CancelPendingOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/** Simplified options for configuring a multisig. */
export interface ConfigureMultisigOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** Number of guardian signatures required (must be > 0 and ≤ guardians.length). */
  requiredSignatures: number;
  /** List of guardian public keys. */
  guardians: PublicKey[];
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/** Simplified options for configuring a swarm. */
export interface ConfigureSwarmOptions {
  /** The treasury PDA. */
  treasury: PublicKey;
  /** Unique swarm identifier. */
  swarmId: string;
  /** List of agent IDs in the swarm. */
  memberAgents: string[];
  /** Shared pool limit in USD cents. */
  sharedPoolLimitUsd: number;
  /** Override the owner (defaults to the configured keypair). */
  owner?: Signer;
}

/**
 * High-level facade for the AURA SDK.
 *
 * Provides a clean, developer-friendly API with sensible defaults and
 * automatic conversions. Wraps `AuraClient` internally.
 */
export class Aura {
  private readonly client: AuraClient;
  private readonly defaultKeypair: Keypair;

  /** Treasury management operations. */
  readonly treasury: {
    /**
     * Creates a new agent treasury with sensible defaults.
     *
     * @returns `{ treasury, signature }` — the treasury PDA and transaction signature.
     */
    create: (options: CreateTreasuryOptions) => Promise<{ treasury: PublicKey; signature: string }>;

    /**
     * Fetches a treasury account by its PDA.
     *
     * @throws if the account does not exist.
     */
    get: (treasury: PublicKey) => ReturnType<AuraClient["getTreasuryAccount"]>;

    /**
     * Fetches a treasury account, returning `null` if it doesn't exist.
     */
    getOrNull: (treasury: PublicKey) => ReturnType<AuraClient["getTreasuryAccountNullable"]>;

    /**
     * Derives the treasury PDA for an owner and agent ID, then fetches it.
     */
    getForOwner: (
      owner: PublicKey,
      agentId: string,
    ) => ReturnType<AuraClient["getTreasuryForOwner"]>;

    /**
     * Proposes a transaction on the treasury.
     */
    propose: (options: ProposeTransactionOptions) => Promise<string>;

    /**
     * Pauses or unpauses execution on the treasury.
     */
    pause: (options: PauseExecutionOptions) => Promise<string>;

    /**
     * Cancels the current pending transaction.
     */
    cancel: (options: CancelPendingOptions) => Promise<string>;
  };

  /** dWallet management operations. */
  readonly dwallet: {
    /**
     * Registers a dWallet reference on the treasury.
     */
    register: (options: RegisterDwalletOptions) => Promise<string>;
  };

  /** Governance operations. */
  readonly governance: {
    /**
     * Configures an emergency guardian multisig.
     */
    configureMultisig: (options: ConfigureMultisigOptions) => Promise<string>;

    /**
     * Configures an agent swarm with shared spending pool.
     */
    configureSwarm: (options: ConfigureSwarmOptions) => Promise<string>;
  };

  constructor(options: AuraOptions) {
    const connection = new Connection(options.rpcUrl, "confirmed");
    const clientOptions: AuraClientOptions = {
      connection,
      programId: options.programId,
    };
    this.client = new AuraClient(clientOptions);
    this.defaultKeypair = options.keypair;

    // Bind treasury namespace
    this.treasury = {
      create: this.createTreasury.bind(this),
      get: this.client.getTreasuryAccount.bind(this.client),
      getOrNull: this.client.getTreasuryAccountNullable.bind(this.client),
      getForOwner: this.client.getTreasuryForOwner.bind(this.client),
      propose: this.proposeTransaction.bind(this),
      pause: this.pauseExecution.bind(this),
      cancel: this.cancelPending.bind(this),
    };

    // Bind dwallet namespace
    this.dwallet = {
      register: this.registerDwallet.bind(this),
    };

    // Bind governance namespace
    this.governance = {
      configureMultisig: this.configureMultisig.bind(this),
      configureSwarm: this.configureSwarm.bind(this),
    };
  }

  /** Returns the underlying low-level client for advanced use cases. */
  get lowLevel(): AuraClient {
    return this.client;
  }

  private async createTreasury(
    options: CreateTreasuryOptions,
  ): Promise<{ treasury: PublicKey; signature: string }> {
    const owner = options.owner ?? this.defaultKeypair;
    const aiAuthority = options.aiAuthority ?? this.defaultKeypair.publicKey;
    const now = Math.floor(Date.now() / 1000);

    const args: CreateTreasuryArgs = {
      agentId: options.agentId,
      aiAuthority,
      createdAt: new BN(now),
      pendingTransactionTtlSecs: new BN(options.pendingTransactionTtlSecs ?? 900),
      policyConfig: {
        dailyLimitUsd: new BN(options.dailyLimitUsd),
        perTxLimitUsd: new BN(options.perTxLimitUsd),
        daytimeHourlyLimitUsd: new BN(
          options.daytimeHourlyLimitUsd ?? Math.floor(options.dailyLimitUsd / 10),
        ),
        nighttimeHourlyLimitUsd: new BN(
          options.nighttimeHourlyLimitUsd ?? Math.floor(options.dailyLimitUsd / 20),
        ),
        velocityLimitUsd: new BN(
          options.velocityLimitUsd ?? Math.floor(options.dailyLimitUsd / 2),
        ),
        allowedProtocolBitmap: new BN(options.allowedProtocolBitmap ?? 31),
        maxSlippageBps: new BN(options.maxSlippageBps ?? 100),
        maxQuoteAgeSecs: new BN(options.maxQuoteAgeSecs ?? 300),
        maxCounterpartyRiskScore: options.maxCounterpartyRiskScore ?? 70,
        bitcoinManualReviewThresholdUsd: new BN(
          options.bitcoinManualReviewThresholdUsd ?? 5_000,
        ),
        sharedPoolLimitUsd: null,
        reputationPolicy: {
          highScoreThreshold: new BN(80),
          mediumScoreThreshold: new BN(50),
          highMultiplierBps: new BN(15_000),
          lowMultiplierBps: new BN(7_000),
        },
      },
      protocolFees: {
        treasuryCreationFeeUsd: new BN(100),
        transactionFeeBps: new BN(10),
        fheSubsidyBps: new BN(5_000),
      },
    };

    return await this.client.createTreasury(owner, args);
  }

  private async registerDwallet(options: RegisterDwalletOptions): Promise<string> {
    const owner = options.owner ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    const args: RegisterDwalletArgs = {
      chain: options.chain,
      dwalletId: options.dwalletId,
      address: options.address,
      balanceUsd: new BN(options.balanceUsd),
      dwalletAccount: null,
      authorizedUserPubkey: null,
      messageMetadataDigest: null,
      publicKeyHex: null,
      timestamp: new BN(now),
    };

    return await this.client.registerDwallet(
      owner,
      { owner: owner.publicKey, treasury: options.treasury },
      args,
    );
  }

  private async proposeTransaction(options: ProposeTransactionOptions): Promise<string> {
    const aiAuthority = options.aiAuthority ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    const args: ProposeTransactionArgs = {
      amountUsd: new BN(options.amountUsd),
      targetChain: options.chain,
      txType: options.txType ?? 0,
      protocolId: options.protocolId ?? null,
      currentTimestamp: new BN(now),
      expectedOutputUsd: options.expectedOutputUsd ? new BN(options.expectedOutputUsd) : null,
      actualOutputUsd: options.actualOutputUsd ? new BN(options.actualOutputUsd) : null,
      quoteAgeSecs: options.quoteAgeSecs ? new BN(options.quoteAgeSecs) : null,
      counterpartyRiskScore: options.counterpartyRiskScore ?? null,
      recipientOrContract: options.recipient,
    };

    return await this.client.proposeTransaction(
      aiAuthority,
      { aiAuthority: aiAuthority.publicKey, treasury: options.treasury },
      args,
    );
  }

  private async pauseExecution(options: PauseExecutionOptions): Promise<string> {
    const owner = options.owner ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    return await this.client.pauseExecution(
      owner,
      { owner: owner.publicKey, treasury: options.treasury },
      options.paused,
      now,
    );
  }

  private async cancelPending(options: CancelPendingOptions): Promise<string> {
    const owner = options.owner ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    return await this.client.cancelPending(
      owner,
      { owner: owner.publicKey, treasury: options.treasury },
      now,
    );
  }

  private async configureMultisig(options: ConfigureMultisigOptions): Promise<string> {
    const owner = options.owner ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    const args: ConfigureMultisigArgs = {
      requiredSignatures: options.requiredSignatures,
      guardians: options.guardians,
      timestamp: new BN(now),
    };

    return await this.client.configureMultisig(
      owner,
      { owner: owner.publicKey, treasury: options.treasury },
      args,
    );
  }

  private async configureSwarm(options: ConfigureSwarmOptions): Promise<string> {
    const owner = options.owner ?? this.defaultKeypair;
    const now = Math.floor(Date.now() / 1000);

    const args: ConfigureSwarmArgs = {
      swarmId: options.swarmId,
      memberAgents: options.memberAgents,
      sharedPoolLimitUsd: new BN(options.sharedPoolLimitUsd),
      timestamp: new BN(now),
    };

    return await this.client.configureSwarm(
      owner,
      { owner: owner.publicKey, treasury: options.treasury },
      args,
    );
  }
}
