"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import type { AgentWalletPermissionRow } from "@/lib/supabase/types";

interface AgentWalletPermissionsResponse {
  permissions: AgentWalletPermissionRow[];
  error?: string;
}

export function useAgentWalletPermissions() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["agent-wallet-permissions", auth.profile?.id],
    queryFn: async () => {
      const response = await fetch("/api/wallets/agent-permissions", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as AgentWalletPermissionsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load wallet permissions.");
      }

      return payload.permissions ?? [];
    },
    enabled: auth.isAuthenticated,
    staleTime: 15_000,
  });
}
