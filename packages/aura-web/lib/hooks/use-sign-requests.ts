"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";

export function useSignRequests() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["sign-requests", auth.profile?.id],
    queryFn: async () => {
      const { data, error } = await auth.supabase
        .from("sign_requests")
        .select("*")
        .eq("request_kind", "wallet_withdrawal_approval")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      return data ?? [];
    },
    enabled: auth.isAuthenticated,
    staleTime: 10_000,
  });
}
