"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { fetchSolanaWalletBalances } from "@/lib/solana/balances";

export function useSolanaWalletBalance(address: string, enabled = true) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["solana-wallet-balance", connection.rpcEndpoint, address],
    queryFn: () => fetchSolanaWalletBalances(connection, address),
    enabled: enabled && Boolean(address),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
