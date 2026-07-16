/**
 * `aura.activity.tail` — recent audit-log entries scoped to the caller's session.
 *
 * Reads from the hash-chained `audit_log` table. The returned hash chain lets
 * the caller verify integrity without trusting Conduit's word.
 */

import { z } from "zod";

import { HashChainedAuditLog } from "../control-plane/audit-log.js";
import type { ConduitDb } from "../control-plane/db.js";
import { strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({
  limit: z.number().int().min(1).max(200).default(20),
});

export type ActivityTailInput = z.infer<typeof input>;

export interface ActivityTailEntry {
  readonly seq: number;
  readonly recordedAtUnix: number;
  readonly tool: string;
  readonly outcome: string;
  readonly errorCode: string | null;
  readonly argsHash: string;
  readonly signature: string | null;
  readonly slot: number | null;
  readonly prevHash: string;
  readonly hash: string;
}

export interface ActivityTailOutput {
  readonly entries: ReadonlyArray<ActivityTailEntry>;
  readonly currentRoot: string;
}

export function createActivityTailTool(
  db: ConduitDb,
): Tool<typeof input, ActivityTailOutput> {
  const log = new HashChainedAuditLog(db);
  return {
    name: "aura.activity.tail",
    description:
      "Returns the most recent audit-log entries (hash-chained) for this session. Includes prev_hash and hash so callers can verify integrity.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(
      parsed: ActivityTailInput,
      ctx: ToolContext,
    ): Promise<ActivityTailOutput> {
      const rows = log
        .tail(parsed.limit)
        .filter((r) => r.sessionId === ctx.session.id);
      return {
        entries: rows.map((row) => ({
          seq: row.seq,
          recordedAtUnix: row.recordedAt,
          tool: row.tool,
          outcome: row.outcome,
          errorCode: row.errorCode ?? null,
          argsHash: row.argsHash,
          signature: row.signature ?? null,
          slot: row.slot ?? null,
          prevHash: row.prevHash,
          hash: row.hash,
        })),
        currentRoot: log.rootHash(),
      };
    },
  };
}
