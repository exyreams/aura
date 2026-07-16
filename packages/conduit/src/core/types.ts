/**
 * Shared types for the Conduit core.
 *
 * The core is transport-agnostic: MCP and HTTP both bind against `Tool`,
 * `ToolContext`, and `Session`. Nothing in here imports from a transport.
 */

import type { PublicKey } from "@solana/web3.js";
import type { z } from "zod";

import type { AuditLogger } from "./audit.js";
import type { ConduitError } from "./errors.js";
import type { IdempotencyStore } from "./idempotency.js";

export type ToolScope = "read" | "propose" | "execute";

export interface Session {
  /** Stable identifier for this session row. */
  readonly id: string;
  /** Human label for the agent ("claude-code-laptop"). */
  readonly agentId: string;
  /** Treasury owner (Solana pubkey). */
  readonly ownerPubkey: PublicKey;
  /** Treasury PDA this session can touch. */
  readonly treasuryPubkey: PublicKey;
  /** On-chain SessionKeyAccount pubkey, or null in stub-auth mode. */
  readonly sessionPubkey: PublicKey | null;
  /** Conduit-side scope grants. */
  readonly scopes: ReadonlyArray<ToolScope>;
  /** Token version recorded at issuance. */
  readonly protocolVersion: number;
  /** Free-form metadata captured at login (machine name, etc.). Never used for trust decisions. */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * Context handed to every tool invocation.
 *
 * The tool is *forbidden* from importing transport-specific objects (no Express
 * `Request`, no MCP `RequestHandlerExtra`). It works only with this context
 * and its declared input schema.
 */
export interface ToolContext {
  readonly session: Session;
  readonly audit: AuditLogger;
  readonly idempotency: IdempotencyStore;
  /** Abort signal propagated from the transport (client disconnect, timeout). */
  readonly signal: AbortSignal;
  /** Per-request id for log correlation. */
  readonly requestId: string;
}

/**
 * Marker for an instruction that a tool may build.
 *
 * Used by the startup invariant in `registry.ts` that refuses to boot if any
 * tool declares an instruction requiring the treasury owner as `Signer`.
 */
export interface DeclaredInstruction {
  readonly name: string;
  readonly requiresSigner: ReadonlyArray<
    "ai_authority" | "session_key" | "guardian" | "operator" | "owner"
  >;
}

export interface Tool<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> {
  /** Wire name, e.g. `aura.treasury.get`. */
  readonly name: string;
  /** Short description shown to the calling model in the MCP tool list. */
  readonly description: string;
  /** Strict Zod input schema. Extra fields rejected, not ignored. */
  readonly input: TInputSchema;
  /** Required scopes. Empty means callable by any authenticated session. */
  readonly requiredScopes: ReadonlyArray<ToolScope>;
  /** Whether the tool mutates external state. Read tools must declare `false`. */
  readonly isWrite: boolean;
  /** Whether this tool causes a proposal to appear in the human inbox. */
  readonly triggersInbox: boolean;
  /** On-chain instructions this tool builds. Empty for pure-read tools. */
  readonly declaredInstructions: ReadonlyArray<DeclaredInstruction>;
  /**
   * `true` when this tool's "write" is a sign-request to the owner rather
   * than an instruction the agent builds itself. Satisfies the write-label
   * invariant without exposing owner-signed instructions on the agent surface.
   */
  readonly proxiesOwnerSignature?: boolean;
  /** The handler. Throws `ConduitError` for any user-visible failure. */
  handler(input: z.infer<TInputSchema>, ctx: ToolContext): Promise<TOutput>;
}

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConduitError };
