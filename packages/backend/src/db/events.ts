import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "./client.js";
import { agentKeypairs, events, treasuries } from "./schema.js";
import type { AuthenticatedUser } from "../auth/index.js";

export type EventKind =
  // ── Lifecycle events we write directly (backend-signed or wallet-signed) ──
  | "treasury_created"
  | "deposit_created"
  | "guardrails_configured"           // maps to confidential_guardrails_configured on activity page
  | "dwallet_created"
  | "dwallet_registered"
  | "proposal_submitted"              // maps to proposal_created
  | "confidential_proposal_submitted"
  | "decryption_requested"
  | "decryption_confirmed"            // maps to decryption_verified
  | "execution_submitted"             // maps to signature_requested / signature_committed
  | "execution_finalized"             // maps to proposal_executed
  // ── On-chain audit event kinds (emitted by the program, parsed from RPC logs) ──
  // Proposal flow
  | "proposal_created"
  | "proposal_cancelled"
  | "proposal_expired"
  | "proposal_denied"
  | "proposal_executed"
  | "decryption_verified"
  | "signature_requested"
  | "signature_committed"
  // Governance
  | "multisig_attached"
  | "override_executed"
  | "ai_authority_rotation_proposed"
  | "ai_authority_rotated"
  | "config_change_proposed"
  | "config_change_executed"
  | "config_change_vetoed"
  | "circuit_breaker_tripped"
  | "circuit_breaker_reset"
  | "session_key_issued"
  | "session_key_revoked"
  | "dead_mans_switch_triggered"
  | "guardian_added"
  | "guardian_removed"
  | "emergency_shutdown"
  | "execution_paused"
  | "execution_resumed"
  // Operational
  | "confidential_guardrails_configured"
  | "fee_collected"
  | "snapshot_taken"
  | "swarm_attached"
  | "swarm_pool_joined"
  | "balance_refreshed"
  | "agent_state_transitioned";

export interface InsertEventInput {
  treasuryAddress: string;
  agentKeypairId?: number | null;
  walletAddress?: string | null;
  kind: EventKind;
  txSignature: string;
  proposalId?: string | null;
  status?: number | null;
  approved?: boolean | null;
  violation?: number | null;
  meta?: Record<string, unknown> | null;
}

function nowSecs() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Insert a single event row. Fire-and-forget safe — errors are swallowed
 * so a DB write failure never breaks the main service response.
 */
export function insertEvent(input: InsertEventInput): void {
  try {
    db.insert(events)
      .values({
        treasuryAddress: input.treasuryAddress,
        agentKeypairId: input.agentKeypairId ?? null,
        walletAddress: input.walletAddress ?? null,
        kind: input.kind,
        txSignature: input.txSignature,
        proposalId: input.proposalId ?? null,
        status: input.status ?? null,
        approved: input.approved == null ? null : input.approved ? 1 : 0,
        violation: input.violation ?? null,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
        timestamp: nowSecs(),
      })
      .run();
  } catch (err) {
    // Non-fatal — log but don't throw
    console.error("[events] insertEvent failed", err);
  }
}

/**
 * Fetch paginated events for all treasuries owned by the authenticated user.
 * Returns events ordered by timestamp DESC.
 */
export function listEventsForUser(
  user: AuthenticatedUser,
  opts: {
    limit?: number;
    before?: number; // unix timestamp — return events older than this
    treasury?: string; // filter to a single treasury
    kind?: EventKind;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 50, 200);

  // Resolve treasury addresses owned by this user
  const userTreasuryAddresses = db
    .select({ treasuryAddress: treasuries.treasuryAddress })
    .from(treasuries)
    .innerJoin(agentKeypairs, eq(agentKeypairs.id, treasuries.agentKeypairId))
    .where(eq(agentKeypairs.userId, user.id))
    .all()
    .map((r) => r.treasuryAddress);

  // Also include wallet-signed events (walletAddress matches user.wallet)
  // by querying both treasury-owned and wallet-owned events.

  if (userTreasuryAddresses.length === 0 && !opts.treasury) {
    // No treasuries yet — return wallet-signed events only
    const conditions = [eq(events.walletAddress, user.wallet)];
    if (opts?.before) conditions.push(lt(events.timestamp, opts.before));
    if (opts?.kind) conditions.push(eq(events.kind, opts.kind));

    const rows = db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.timestamp))
      .limit((opts?.limit ?? 50) + 1)
      .all();

    const hasMore = rows.length > (opts?.limit ?? 50);
    return { events: rows.slice(0, opts?.limit ?? 50).map(parseEvent), hasMore };
  }

  const targetAddresses = opts.treasury
    ? [opts.treasury]
    : userTreasuryAddresses;

  // Build conditions: (treasury_address IN [...] OR wallet_address = user.wallet)
  const addressCondition = targetAddresses.length > 0
    ? or(
        inArray(events.treasuryAddress, targetAddresses),
        eq(events.walletAddress, user.wallet),
      )
    : eq(events.walletAddress, user.wallet);

  const conditions = [addressCondition];
  if (opts.before) conditions.push(lt(events.timestamp, opts.before));
  if (opts.kind) conditions.push(eq(events.kind, opts.kind));

  const rows = db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.timestamp))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  return { events: rows.slice(0, limit).map(parseEvent), hasMore };
}

/**
 * Update the most recent proposal_submitted event for a treasury
 * when the proposal reaches a terminal state.
 *
 * When proposalId is provided, tries an exact match first. If not found
 * (e.g., the proposal_submitted event was stored with proposalId=null because
 * the post-submit RPC read failed), falls back to the most recent unset event
 * and also backfills the proposalId column so future queries can find it.
 */
export function updateProposalEvent(input: {
  treasuryAddress: string;
  proposalId?: string | null;
  approved: boolean;
  violation?: number | null;
  status?: number | null;
}): void {
  try {
    const proposalKinds = or(
      eq(events.kind, "proposal_submitted"),
      eq(events.kind, "confidential_proposal_submitted"),
    );

    let target: { id: number } | undefined;

    if (input.proposalId) {
      // Exact match by proposalId — no approved guard (idempotent update is fine)
      target = db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.treasuryAddress, input.treasuryAddress),
            eq(events.proposalId, input.proposalId),
            proposalKinds,
          ),
        )
        .get();
    }

    // If not found by exact proposalId, fall back to most recent unset event.
    // This handles the case where proposal_submitted was stored with proposalId=null
    // because the post-submit RPC read failed.
    if (!target) {
      target = db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.treasuryAddress, input.treasuryAddress),
            proposalKinds,
            isNull(events.approved),
          ),
        )
        .orderBy(desc(events.timestamp))
        .get();
    }

    if (!target) return;

    db.update(events)
      .set({
        // Backfill proposalId if it was missing — links the event for future grouping
        ...(input.proposalId ? { proposalId: input.proposalId } : {}),
        approved: input.approved ? 1 : 0,
        violation: input.violation ?? null,
        status: input.status ?? null,
      })
      .where(eq(events.id, target.id))
      .run();
  } catch (err) {
    console.error("[events] updateProposalEvent failed", err);
  }
}

function parseEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    treasuryAddress: row.treasuryAddress,
    agentKeypairId: row.agentKeypairId,
    walletAddress: row.walletAddress,
    kind: row.kind as EventKind,
    txSignature: row.txSignature,
    proposalId: row.proposalId,
    status: row.status,
    approved: row.approved == null ? null : row.approved === 1,
    violation: row.violation,
    meta: row.metaJson ? (JSON.parse(row.metaJson) as Record<string, unknown>) : null,
    timestamp: row.timestamp,
  };
}
