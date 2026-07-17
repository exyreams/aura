"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import type { AgentSessionWithUsage } from "@/lib/agents/session-model";

interface AgentSessionsResponse {
  sessions: AgentSessionWithUsage[];
  error?: string;
}

export function useAgentSessions() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["agent-sessions", auth.profile?.id],
    queryFn: async () => {
      const response = await fetch("/api/agents", {
        credentials: "same-origin",
      });
      const payload = (await response.json()) as AgentSessionsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load agent sessions.");
      }

      return payload.sessions ?? [];
    },
    enabled: auth.isAuthenticated,
    staleTime: 15_000,
  });
}
