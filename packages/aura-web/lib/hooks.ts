"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import { AppSettingsContext } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

export interface AgentKeypair {
  id: number;
  agentId: string;
  label: string;
  publicKey: string;
  createdAt: number;
}

function readStringMetadata(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

export function useAppSettings() {
  return AppSettingsContext.useValue();
}

export function useAuth() {
  const wallet = useWallet();
  const auth = useOwnerAuth();
  const walletAddress = wallet.publicKey?.toBase58() ?? null;

  return {
    user: auth.profile
      ? {
          wallet: auth.profile.wallet_address,
        }
      : null,
    walletAddress,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    isSigningIn: auth.isSigningIn,
    needsSignIn: Boolean(walletAddress && !auth.isAuthenticated),
    error: auth.error,
    login: auth.signIn,
    logout: auth.signOut,
    refetch: auth.refreshProfile,
  };
}

export function useAgents() {
  const settings = useAppSettings();
  const sessionsQuery = useAgentSessions();

  const agents = useMemo<AgentKeypair[]>(
    () =>
      (sessionsQuery.data ?? []).map((session, index) => ({
        id: index,
        agentId: session.agent_id,
        label: session.agent_label ?? session.agent_id,
        publicKey: readStringMetadata(session.metadata, "publicKey"),
        createdAt: Math.floor(new Date(session.created_at).getTime() / 1000),
      })),
    [sessionsQuery.data],
  );

  const selectedAgent =
    agents.find((agent) => agent.agentId === settings.selectedAgentId) ??
    agents[0] ??
    null;
  const selectedAgentId = selectedAgent?.agentId ?? settings.selectedAgentId;

  return {
    agents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId: settings.setSelectedAgentId,
    isLoading: sessionsQuery.isLoading,
    error: sessionsQuery.error,
    refetch: sessionsQuery.refetch,
  };
}

export { useActivityEvents } from "@/lib/hooks/use-activity-events";
export { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
export { useSolanaWalletBalance } from "@/lib/hooks/use-solana-wallet-balance";
export { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";
