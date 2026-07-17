"use client";

import { useQuery } from "@tanstack/react-query";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";

export function useWalletRegistry() {
  const auth = useOwnerAuth();

  return useQuery({
    queryKey: ["wallet-registry", auth.profile?.id],
    queryFn: async () => {
      const { data, error } = await auth.supabase
        .from("wallet_registry")
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
