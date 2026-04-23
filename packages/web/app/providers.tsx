"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  UnsafeBurnerWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import {
  AppSettingsContext,
  type AppSettingsContextValue,
  usePersistentState,
} from "@/lib/settings";

function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = usePersistentState<"devnet" | "mainnet-beta">(
    "aura:network",
    "devnet",
  );
  const [customRpcUrl, setCustomRpcUrl] = usePersistentState<string>(
    "aura:custom-rpc-url",
    "",
  );
  const [programId, setProgramId] = usePersistentState<string>(
    "aura:program-id",
    "",
  );
  const [nimApiKey, setNimApiKey] = usePersistentState<string>(
    "aura:nim-api-key",
    "",
  );
  const [currency, setCurrency] = usePersistentState<string>(
    "aura:currency",
    "USD",
  );
  const [dateFormat, setDateFormat] = usePersistentState<string>(
    "aura:date-format",
    "MMM DD, YYYY HH:mm",
  );

  const endpoint = customRpcUrl || clusterApiUrl(network);
  let resolvedProgramId: PublicKey | undefined;
  try {
    resolvedProgramId = programId.trim()
      ? new PublicKey(programId.trim())
      : undefined;
  } catch {
    resolvedProgramId = undefined;
  }

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      network,
      endpoint,
      customRpcUrl,
      programId,
      resolvedProgramId,
      nimApiKey,
      currency,
      dateFormat,
      setNetwork,
      setCustomRpcUrl,
      setProgramId,
      setNimApiKey,
      setCurrency,
      setDateFormat,
    }),
    [
      currency,
      customRpcUrl,
      dateFormat,
      endpoint,
      network,
      nimApiKey,
      programId,
      resolvedProgramId,
      setCurrency,
      setCustomRpcUrl,
      setDateFormat,
      setNetwork,
      setNimApiKey,
      setProgramId,
    ],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

function SolanaProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const settings = AppSettingsContext.useValue();
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new UnsafeBurnerWalletAdapter(),
    ],
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={settings.endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppSettingsProvider>
      <SolanaProviders>{children}</SolanaProviders>
    </AppSettingsProvider>
  );
}
