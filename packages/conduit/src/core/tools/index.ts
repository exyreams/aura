/**
 * Tool catalogue builder.
 *
 * The startup invariants in `registry.ts` run against whatever this returns.
 */

import type { ConduitDb } from "../control-plane/db.js";
import type { SigningService } from "../signing/types.js";
import type { SolanaContext } from "../solana.js";
import { TocTouGuard } from "../toctou.js";
import type { Tool } from "../types.js";

import { createActivityTailTool } from "./activity-tail.js";
import { createExecutePendingTool } from "./execute-pending.js";
import { instructionDescribeTool } from "./instruction-describe.js";
import { instructionListTool } from "./instruction-list.js";
import { createInstructionPrepareTool } from "./instruction-prepare.js";
import { createInstructionSignRequestTool } from "./instruction-sign-request.js";
import { createPolicyPreviewTool } from "./policy-preview.js";
import { createProposalCancelTool } from "./proposal-cancel.js";
import { createProposalCreateTool } from "./proposal-create.js";
import { createProposalGetTool } from "./proposal-get.js";
import { createProposalListTool } from "./proposal-list.js";
import { createSessionStatusTool } from "./session-status.js";
import { createTreasuryGetTool } from "./treasury-get.js";
import { whoamiTool } from "./whoami.js";

export interface BuildCatalogueOptions {
  readonly solana: SolanaContext;
  readonly db: ConduitDb;
  readonly signer: SigningService;
  readonly dashboardBaseUrl: string;
  readonly toctou?: TocTouGuard;
}

export function buildToolCatalogue(
  options: BuildCatalogueOptions,
): ReadonlyArray<Tool> {
  const toctou = options.toctou ?? new TocTouGuard();
  return [
    whoamiTool,
    instructionListTool,
    instructionDescribeTool,
    createInstructionPrepareTool(options.solana),
    createInstructionSignRequestTool({
      db: options.db,
      solana: options.solana,
    }),
    createTreasuryGetTool(options.solana),
    createPolicyPreviewTool(options.solana, toctou),
    createSessionStatusTool(options.solana),
    createActivityTailTool(options.db),
    createProposalListTool(options.db),
    createProposalGetTool(options.db),
    createProposalCreateTool({
      db: options.db,
      solana: options.solana,
      signer: options.signer,
      dashboardBaseUrl: options.dashboardBaseUrl,
      toctou,
    }),
    createProposalCancelTool({
      db: options.db,
      dashboardBaseUrl: options.dashboardBaseUrl,
    }),
    createExecutePendingTool({
      db: options.db,
      solana: options.solana,
      signer: options.signer,
    }),
  ];
}

export {
  createActivityTailTool,
  createExecutePendingTool,
  createInstructionPrepareTool,
  createInstructionSignRequestTool,
  createPolicyPreviewTool,
  createProposalCancelTool,
  createProposalCreateTool,
  createProposalGetTool,
  createProposalListTool,
  createSessionStatusTool,
  createTreasuryGetTool,
  instructionDescribeTool,
  instructionListTool,
  whoamiTool,
};
