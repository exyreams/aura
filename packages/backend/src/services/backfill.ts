/**
 * Activity backfill service.
 *
 * Pulls historical transactions for all treasuries owned by the authenticated
 * user via the Helius Enhanced Transaction History API (no RPC rate limits),
 * parses Anchor events from the logs, and writes them to the events table.
 *
 * Idempotent — skips events whose tx_signature already exists in the DB.
 */

import BN from "bn.js";
import { BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import { AuraClient } from "@aura-protocol/sdk-ts";
import { Connection, PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import type { AuthenticatedUser } from "../auth/index.js";
import { db } from "../db/client.js";
import { events, agentKeypairs, treasuries } from "../db/schema.js";
import { insertEvent, type EventKind } from "../db/events.js";
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";

const config = loadConfig();
const logger = createLogger(config).child({ module: "backfill" });

const HELIUS_BASE = "https://api-devnet.helius-rpc.com";

interface HeliusTx {
  signature: string;
  timestamp: number;
  slot: number;
  err: unknown;
  logs: string[];
}

async function fetchHeliusTxHistory(
  address: string,
  apiKey: string,
  limit = 100,
  before?: string,
): Promise<HeliusTx[]> {
  const params = new URLSearchParams({
    "api-key": apiKey,
    limit: String(Math.min(limit, 100)),
  });
  if (before) params.set("before", before);

  const url = `${HELIUS_BASE}/v0/addresses/${address}/transactions?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Helius API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{
    signature: string;
    timestamp: number;
    slot: number;
    transactionError: unknown;
    logs?: string[];
  }>;

  return data.map((tx) => ({
    signature: tx.signature,
    timestamp: tx.timestamp,
    slot: tx.slot,
    err: tx.transactionError,
    logs: tx.logs ?? [],
  }));
}

function buildEventParser(rpcUrl: string, programId: PublicKey) {
  const connection = new Connection(rpcUrl, "confirmed");
  const client = new AuraClient({ connection, programId });
  const coder = new BorshCoder(client.program.idl as Idl);
  return new EventParser(programId, coder);
}

function alreadyExists(txSignature: string): boolean {
  const row = db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.txSignature, txSignature))
    .get();
  return !!row;
}

export async function backfillActivity(
  user: AuthenticatedUser,
  opts: { perTreasury?: number } = {},
): Promise<{ processed: number; inserted: number; skipped: number; treasuries: number; addresses: string[] }> {
  const perTreasury = Math.min(opts.perTreasury ?? 100, 200);
  const apiKey = config.heliusApiKey;

  if (!apiKey) {
    throw new Error("AURA_HELIUS_API_KEY is not configured. Set it in .env to enable backfill.");
  }

  // Get all treasury addresses for this user
  const userTreasuries = db
    .select({
      treasuryAddress: treasuries.treasuryAddress,
      agentKeypairId: treasuries.agentKeypairId,
    })
    .from(treasuries)
    .innerJoin(agentKeypairs, eq(agentKeypairs.id, treasuries.agentKeypairId))
    .where(eq(agentKeypairs.userId, user.id))
    .all();

  if (userTreasuries.length === 0) {
    logger.info("backfill.no_treasuries", { userId: user.id, wallet: user.wallet });
    return { processed: 0, inserted: 0, skipped: 0, treasuries: 0, addresses: [] };
  }

  logger.info("backfill.start", { userId: user.id, treasuryCount: userTreasuries.length, addresses: userTreasuries.map(t => t.treasuryAddress) });

  const parser = buildEventParser(
    config.defaultRpcUrl,
    config.defaultProgramId,
  );

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { treasuryAddress, agentKeypairId } of userTreasuries) {
    logger.info("backfill.treasury.start", { treasuryAddress });

    let txs: HeliusTx[] = [];
    try {
      txs = await fetchHeliusTxHistory(treasuryAddress, apiKey, perTreasury);
      logger.info("backfill.helius.fetched", { treasuryAddress, txCount: txs.length });
    } catch (err) {
      logger.warn("backfill.helius.failed", { treasuryAddress, error: String(err) });
      continue;
    }

    for (const tx of txs) {
      totalProcessed++;

      // Skip if already in DB
      if (alreadyExists(tx.signature)) {
        totalSkipped++;
        continue;
      }

      if (!tx.logs || tx.logs.length === 0) {
        totalSkipped++;
        continue;
      }

      // Parse Anchor events from logs
      let parsedAny = false;
      try {
        const parsed = Array.from(parser.parseLogs(tx.logs));

        for (const [idx, event] of parsed.entries()) {
          if (event.name === "proposalLifecycleEvent") {
            const data = event.data as {
              treasury: PublicKey;
              proposalId: BN;
              proposalDigest: string;
              status: number;
              approved: boolean;
              violation: number;
            };
            insertEvent({
              treasuryAddress: data.treasury.toBase58(),
              agentKeypairId,
              kind: "proposal_submitted" as EventKind,
              txSignature: tx.signature,
              proposalId: data.proposalId.toString(),
              status: data.status,
              approved: data.approved,
              violation: data.violation,
              meta: { proposalDigest: data.proposalDigest, eventIndex: idx },
            });
            parsedAny = true;
          }

          if (event.name === "executionLifecycleEvent") {
            const data = event.data as {
              treasury: PublicKey;
              proposalId: BN;
              proposalDigest: string;
              finalStatus: number;
              approved: boolean;
              violation: number;
              messageApprovalAccount: string | null;
              decryptionRequestAccount: string | null;
            };
            insertEvent({
              treasuryAddress: data.treasury.toBase58(),
              agentKeypairId,
              kind: "execution_finalized" as EventKind,
              txSignature: tx.signature,
              proposalId: data.proposalId.toString(),
              status: data.finalStatus,
              approved: data.approved,
              violation: data.violation,
              meta: {
                proposalDigest: data.proposalDigest,
                messageApprovalAccount: data.messageApprovalAccount,
                decryptionRequestAccount: data.decryptionRequestAccount,
                eventIndex: idx,
              },
            });
            parsedAny = true;
          }

          if (event.name === "treasuryAuditEvent") {
            const data = event.data as {
              treasury: PublicKey;
              kind: string;
              detail: string;
              timestamp: BN;
            };
            const rawKind = data.detail?.split(":")[0]?.trim() ?? data.kind;
            insertEvent({
              treasuryAddress: data.treasury.toBase58(),
              agentKeypairId,
              kind: rawKind as EventKind,
              txSignature: tx.signature,
              meta: {
                detail: data.detail,
                auditKind: data.kind,
                eventIndex: idx,
              },
            });
            parsedAny = true;
          }
        }
      } catch {
        // Unparseable tx — skip silently
      }

      if (parsedAny) {
        totalInserted++;
      } else {
        totalSkipped++;
      }
    }

    logger.info("backfill.treasury.done", { treasuryAddress, txCount: txs.length });
  }

  return {
    processed: totalProcessed,
    inserted: totalInserted,
    skipped: totalSkipped,
    treasuries: userTreasuries.length,
    addresses: userTreasuries.map(t => t.treasuryAddress),
  };
}
