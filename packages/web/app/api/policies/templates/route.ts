import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import {
  loadPolicyTemplateSnapshots,
  loadTreasuryPolicySnapshots,
  type PolicyCluster,
  refreshPolicyTemplateSnapshotsFromChain,
} from "@/lib/policies/policy-snapshot-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not load policy templates.";
}

function getPublicKey(value: string | null, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }

  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getCluster(value: string | null): PolicyCluster {
  return value === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

function getProgramId(value: string | null) {
  const text =
    value?.trim() ||
    process.env.NEXT_PUBLIC_AURA_PROGRAM_ID?.trim() ||
    DEFAULT_AURA_PROGRAM_ID;

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error("AURA program ID must be a valid Solana address.");
  }
}

function getRpcUrl(cluster: PolicyCluster) {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

  if (configured) {
    return configured;
  }

  return cluster === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError("Sign in before loading policy templates.", 401);
    }

    const url = new URL(request.url);
    let ownerWallet: string;
    let cluster: PolicyCluster;
    let programId: string;

    try {
      ownerWallet = getPublicKey(url.searchParams.get("owner"), "Owner wallet");
      cluster = getCluster(url.searchParams.get("cluster"));
      programId = getProgramId(url.searchParams.get("programId"));
    } catch (cause) {
      return jsonError(getErrorMessage(cause), 400);
    }

    let admin: ReturnType<typeof createSupabaseAdminClient>;

    try {
      admin = createSupabaseAdminClient();
    } catch (cause) {
      return jsonError(getErrorMessage(cause), 500);
    }

    let primaryWallet: Awaited<ReturnType<typeof getPrimaryAccountWallet>>;
    try {
      primaryWallet = await getPrimaryAccountWallet(admin, user.id);
    } catch (cause) {
      return jsonError(getErrorMessage(cause), 500);
    }

    if (!primaryWallet) {
      return jsonError(
        "Link a primary owner wallet before loading policy templates.",
        409,
      );
    }

    if (primaryWallet.wallet_address !== ownerWallet) {
      return jsonError(
        "Connect the primary owner wallet before loading policy templates.",
        403,
      );
    }

    let templates = await loadPolicyTemplateSnapshots({
      admin,
      ownerId: user.id,
      ownerWallet,
      cluster,
      programId,
    });
    const forceRefresh = url.searchParams.get("refresh") === "1";
    let source: "supabase_cache" | "rpc_refresh" = "supabase_cache";
    let warning: string | null = null;

    if (forceRefresh || templates.length === 0) {
      try {
        templates = await refreshPolicyTemplateSnapshotsFromChain({
          admin,
          ownerId: user.id,
          ownerWallet,
          cluster,
          programId,
          connection: new Connection(getRpcUrl(cluster), "confirmed"),
        });
        source = "rpc_refresh";
      } catch (cause) {
        if (templates.length === 0) {
          return jsonError(getErrorMessage(cause), 502);
        }

        warning = getErrorMessage(cause);
      }
    }

    const treasuryPolicySnapshots = await loadTreasuryPolicySnapshots({
      admin,
      ownerId: user.id,
      ownerWallet,
      cluster,
      programId,
    });

    return NextResponse.json({
      templates,
      treasuryPolicySnapshots,
      source,
      warning,
      cachedAt: new Date().toISOString(),
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
