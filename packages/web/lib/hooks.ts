"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import {
  getAgentAuthorityPublicKey,
  getAgentOnchainStatus,
} from "@/lib/agents/metadata";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import { AppSettingsContext } from "@/lib/settings";

export interface AgentKeypair {
  id: string;
  agentId: string;
  label: string;
  publicKey: string;
  createdAt: number;
  treasuryPda: string | null;
  onchainStatus: string;
  status: "active" | "expired" | "revoked" | "suspended";
  scopes: string[];
  expiresAt: string | null;
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
          id: auth.profile.id,
          email: auth.user?.email ?? auth.profile.email,
          wallet:
            auth.primaryWallet?.wallet_address ??
            auth.profile.wallet_address ??
            null,
        }
      : null,
    walletAddress,
    isAuthenticated: auth.isAuthenticated,
    needsWalletLink: auth.needsWalletLink,
    isLoading: auth.isLoading,
    isSigningIn: auth.isSigningIn || auth.isSubmitting,
    needsSignIn: !auth.isAuthenticated,
    error: auth.error,
    logout: auth.signOut,
    refetch: auth.refreshProfile,
  };
}

export function useAgents() {
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const sessionsQuery = useAgentSessions();

  const agents = useMemo<AgentKeypair[]>(
    () =>
      (sessionsQuery.data ?? []).map((session) => ({
        id: session.id,
        agentId: session.agent_id,
        label: session.agent_label ?? session.agent_id,
        publicKey: getAgentAuthorityPublicKey(session.metadata),
        createdAt: Math.floor(new Date(session.created_at).getTime() / 1000),
        treasuryPda: session.treasury_pda,
        onchainStatus: getAgentOnchainStatus(session.metadata),
        status: session.status,
        scopes: session.scopes,
        expiresAt: session.expires_at,
      })),
    [sessionsQuery.data],
  );

  const selectedAgent =
    agents.find((agent) => agent.agentId === settings.selectedAgentId) ??
    agents[0] ??
    null;
  const selectedAgentId = selectedAgent?.agentId ?? settings.selectedAgentId;
  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/agents/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not delete agent.");
      }
    },
    onSuccess: async (_result, id) => {
      const deleted = agents.find((agent) => agent.id === id);
      if (deleted?.agentId === settings.selectedAgentId) {
        settings.setSelectedAgentId("");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
  });

  const downloadAgentIdentity = async (agent: AgentKeypair) => ({
    format: "aura-agent-public-identity-v1",
    agentId: agent.agentId,
    label: agent.label,
    publicKey: agent.publicKey,
    treasuryPda: agent.treasuryPda,
    scopes: agent.scopes,
    status: agent.status,
    expiresAt: agent.expiresAt,
  });

  return {
    agents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId: settings.setSelectedAgentId,
    isLoading: sessionsQuery.isLoading,
    error: sessionsQuery.error,
    refetch: sessionsQuery.refetch,
    deleteAgent: deleteAgentMutation.mutateAsync,
    deleteAgentMutation,
    downloadAgentIdentity,
  };
}

export { useActivityEvents } from "@/lib/hooks/use-activity-events";
export { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
export { useSignRequests } from "@/lib/hooks/use-sign-requests";
export { useSolanaWalletBalance } from "@/lib/hooks/use-solana-wallet-balance";
export { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";
