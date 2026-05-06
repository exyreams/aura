"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { backendRequest, postBackend } from "@/lib/backend-client";
import { AppSettingsContext } from "@/lib/settings";

export interface AuthUser {
  wallet: string;
  expiresAt?: number;
}

interface AuthMeResponse {
  wallet?: string | null;
}

interface AuthNonceResponse {
  nonce: string;
  expiresAt: number;
  message: string;
}

interface AuthLoginResponse {
  wallet: string;
  expiresAt: number;
}

export interface AgentKeypair {
  id: number;
  agentId: string;
  label: string;
  publicKey: string;
  createdAt: number;
}

export interface AgentIdentity {
  agentId: string;
  publicKey: string;
  label: string;
  createdAt: number;
}

interface AgentsResponse {
  agents: AgentKeypair[];
}

interface CreateAgentResponse {
  agent: AgentKeypair;
  identity: AgentIdentity;
}

interface AuthContextValue {
  user: AuthUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  needsSignIn: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthSettings() {
  return AppSettingsContext.useValue();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const settings = useAuthSettings();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const walletAddress = wallet.publicKey?.toBase58() ?? null;
  const previousWalletRef = useRef<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["auth-me", settings.backendUrl, walletAddress],
    queryFn: async (): Promise<AuthUser | null> => {
      if (!walletAddress) {
        return null;
      }
      try {
        const response = await backendRequest<AuthMeResponse>(
          settings.backendUrl,
          "/v1/auth/me",
          { method: "GET" },
        );
        return response.wallet ? { wallet: response.wallet } : null;
      } catch {
        return null;
      }
    },
    enabled: Boolean(walletAddress),
    retry: false,
    staleTime: 30_000,
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet before signing in.");
      }
      if (!wallet.signMessage) {
        throw new Error(
          "The selected wallet does not support message signing.",
        );
      }

      const nonce = await backendRequest<AuthNonceResponse>(
        settings.backendUrl,
        "/v1/auth/nonce",
        { method: "GET" },
      );
      const messageBytes = new TextEncoder().encode(nonce.message);
      const signature = await wallet.signMessage(messageBytes);
      await postBackend<AuthLoginResponse>(
        settings.backendUrl,
        "/v1/auth/login",
        {
          walletAddress: wallet.publicKey.toBase58(),
          message: nonce.message,
          signature: bs58.encode(signature),
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const logout = useCallback(async () => {
    try {
      await postBackend(settings.backendUrl, "/v1/auth/logout", {});
    } finally {
      settings.setSelectedAgentId("");
      queryClient.setQueryData(
        ["auth-me", settings.backendUrl, walletAddress],
        null,
      );
      queryClient.removeQueries({ queryKey: ["agents"] });
    }
  }, [queryClient, settings, walletAddress]);

  useEffect(() => {
    const previousWallet = previousWalletRef.current;
    if (previousWallet && !walletAddress) {
      void logout();
    }
    previousWalletRef.current = walletAddress;
  }, [logout, walletAddress]);

  const user = sessionQuery.data ?? null;
  const isAuthenticated = Boolean(
    walletAddress && user?.wallet && user.wallet === walletAddress,
  );
  const needsSignIn = Boolean(
    walletAddress && !sessionQuery.isFetching && !isAuthenticated,
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: isAuthenticated ? user : null,
      walletAddress,
      isAuthenticated,
      // isLoading is true only on the initial fetch (no cached data yet).
      // isFetching alone would also fire on background refetches, causing
      // the skeleton to flash on every navigation — so we exclude it here.
      isLoading: sessionQuery.isLoading,
      isSigningIn: loginMutation.isPending,
      needsSignIn,
      error:
        loginMutation.error instanceof Error
          ? loginMutation.error.message
          : null,
      login: async () => {
        await loginMutation.mutateAsync();
      },
      logout,
      refetch: async () => {
        await sessionQuery.refetch();
      },
    }),
    [
      isAuthenticated,
      loginMutation,
      logout,
      needsSignIn,
      sessionQuery,
      user,
      walletAddress,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("AuthProvider is missing.");
  }
  return value;
}

export function useAgents() {
  const settings = useAuthSettings();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({
    queryKey: ["agents", settings.backendUrl, auth.user?.wallet],
    queryFn: () =>
      backendRequest<AgentsResponse>(settings.backendUrl, "/v1/agents", {
        method: "GET",
      }),
    enabled: auth.isAuthenticated,
    retry: 1,
    staleTime: 15_000,
  });

  const agents = agentsQuery.data?.agents ?? [];
  const selectedAgent =
    agents.find((agent) => agent.agentId === settings.selectedAgentId) ??
    agents[0] ??
    null;

  useEffect(() => {
    if (!auth.isAuthenticated || agentsQuery.isLoading) {
      return;
    }
    if (agents.length === 0) {
      if (settings.selectedAgentId) {
        settings.setSelectedAgentId("");
      }
      return;
    }
    if (!selectedAgent || settings.selectedAgentId !== selectedAgent.agentId) {
      settings.setSelectedAgentId(selectedAgent.agentId);
    }
  }, [
    agents,
    agentsQuery.isLoading,
    auth.isAuthenticated,
    selectedAgent,
    settings,
  ]);

  const createAgentMutation = useMutation({
    mutationFn: (input: { agentId: string; label?: string }) =>
      postBackend<CreateAgentResponse>(
        settings.backendUrl,
        "/v1/agents",
        input,
      ),
    onSuccess: async (result) => {
      settings.setSelectedAgentId(result.agent.agentId);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id: number) =>
      backendRequest<{ deleted: boolean; id: number }>(
        settings.backendUrl,
        `/v1/agents/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: async (_result, id) => {
      const deleted = agents.find((agent) => agent.id === id);
      if (deleted?.agentId === settings.selectedAgentId) {
        settings.setSelectedAgentId("");
      }
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const downloadAgentIdentity = useCallback(
    async (agent: AgentKeypair) =>
      backendRequest<AgentIdentity>(
        settings.backendUrl,
        `/v1/agents/${agent.id}/download`,
        { method: "GET" },
      ),
    [settings.backendUrl],
  );

  return {
    agents,
    selectedAgent,
    selectedAgentId: selectedAgent?.agentId ?? settings.selectedAgentId,
    setSelectedAgentId: settings.setSelectedAgentId,
    isLoading: agentsQuery.isLoading || agentsQuery.isFetching,
    error:
      agentsQuery.error instanceof Error ? agentsQuery.error.message : null,
    refetch: agentsQuery.refetch,
    createAgent: createAgentMutation.mutateAsync,
    createAgentMutation,
    deleteAgent: deleteAgentMutation.mutateAsync,
    deleteAgentMutation,
    downloadAgentIdentity,
  };
}
