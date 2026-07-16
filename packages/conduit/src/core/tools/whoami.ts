import type { z } from "zod";

import { strictObject } from "../schemas.js";
import type { Tool, ToolContext } from "../types.js";

const input = strictObject({});

export type WhoamiInput = z.infer<typeof input>;

export interface WhoamiOutput {
  readonly sessionId: string;
  readonly agentId: string;
  readonly ownerPubkey: string;
  readonly treasuryPubkey: string;
  readonly sessionPubkey: string | null;
  readonly scopes: ReadonlyArray<string>;
  readonly protocolVersion: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export const whoamiTool: Tool<typeof input, WhoamiOutput> = {
  name: "aura.whoami",
  description:
    "Returns the calling session: agent id, treasury, scopes, on-chain session key (if any), and Conduit protocol version. Always callable.",
  input,
  requiredScopes: [],
  isWrite: false,
  triggersInbox: false,
  declaredInstructions: [],
  async handler(_input: WhoamiInput, ctx: ToolContext): Promise<WhoamiOutput> {
    const { session } = ctx;
    return {
      sessionId: session.id,
      agentId: session.agentId,
      ownerPubkey: session.ownerPubkey.toBase58(),
      treasuryPubkey: session.treasuryPubkey.toBase58(),
      sessionPubkey: session.sessionPubkey?.toBase58() ?? null,
      scopes: session.scopes,
      protocolVersion: session.protocolVersion,
      metadata: session.metadata,
    };
  },
};
