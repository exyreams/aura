"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";

export function useActivityEvents() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["activity-events", auth.profile?.id],
    queryFn: async () => {
      const { data, error } = await auth.supabase
        .from("activity_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return data ?? [];
    },
    enabled: auth.isAuthenticated,
    staleTime: 10_000,
  });
}
