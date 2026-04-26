"use client";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/theme";
import { FaviconSwitcher } from "@/components/theme/FaviconSwitcher";
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
    AURA_PROGRAM_ID.toBase58(),
  );
  const [backendUrl, setBackendUrl] = usePersistentState<string>(
    "aura:backend-url",
    "http://127.0.0.1:8787",
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
      backendUrl,
      nimApiKey,
      currency,
      dateFormat,
      setNetwork,
      setCustomRpcUrl,
      setProgramId,
      setBackendUrl,
      setNimApiKey,
      setCurrency,
      setDateFormat,
    }),
    [
      currency,
      customRpcUrl,
      dateFormat,
      endpoint,
      backendUrl,
      network,
      nimApiKey,
      programId,
      resolvedProgramId,
      setCurrency,
      setCustomRpcUrl,
      setDateFormat,
      setBackendUrl,
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
  const wallets = useMemo(() => [], []);

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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
      <FaviconSwitcher />
      <AppSettingsProvider>
        <SolanaProviders>{children}</SolanaProviders>
      </AppSettingsProvider>
    </ThemeProvider>
  );
}
