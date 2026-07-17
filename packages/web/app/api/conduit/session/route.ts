import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { metadataString } from "@/lib/agents/session-model";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Missing Conduit bearer token")) {
    return 401;
  }

  if (
    message.includes("Unknown or revoked") ||
    message.includes("revoked") ||
    message.includes("expired") ||
    message.includes("suspended")
  ) {
    return 403;
  }

  return 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load session.";
}

function normalizePublicKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "read");
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getErrorStatus(cause));
  }

  const primaryWallet = await getPrimaryAccountWallet(
    auth.admin,
    auth.session.owner_id,
  );

  if (!primaryWallet) {
    return jsonError(
      "This Conduit session owner does not have a primary wallet.",
      409,
    );
  }

  const sessionPubkey =
    normalizePublicKey(metadataString(auth.session.metadata, "publicKey")) ??
    normalizePublicKey(
      metadataString(auth.session.metadata, "authority_public_key"),
    );
  const treasuryPubkey =
    normalizePublicKey(auth.session.treasury_pda) ??
    primaryWallet.wallet_address;

  return NextResponse.json({
    session: {
      id: auth.session.id,
      agentId: auth.session.agent_id,
      ownerPubkey: primaryWallet.wallet_address,
      treasuryPubkey,
      sessionPubkey,
      scopes: auth.session.scopes,
      protocolVersion: 1,
      metadata: {
        agent_label: auth.session.agent_label,
        created_via: metadataString(auth.session.metadata, "created_via"),
        owner_id: auth.session.owner_id,
        owner_wallet_id: primaryWallet.id,
        primary_wallet: primaryWallet.wallet_address,
        treasury_status: auth.session.treasury_pda ? "bound" : "unbound",
      },
    },
  });
}
