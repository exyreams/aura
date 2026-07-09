"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";

export function useAgentSessions() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["agent-sessions", auth.profile?.id],
    queryFn: async () => {
      const { data, error } = await auth.supabase
        .from("agent_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
    enabled: auth.isAuthenticated,
    staleTime: 15_000,
  });
}
