"use client";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/theme";
import { FaviconSwitcher } from "@/components/theme/FaviconSwitcher";
import { AuthProvider } from "@/lib/auth";
import {
  AppSettingsContext,
  type AppSettingsContextValue,
  DEFAULT_BACKEND_URL,
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
    DEFAULT_BACKEND_URL,
  );
  const [selectedAgentId, setSelectedAgentId] = usePersistentState<string>(
    "aura:selected-agent-id",
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

  useEffect(() => {
    window.localStorage.removeItem("aura:backend-auth-token");
    // Migrate old direct backend URLs to the proxy path
    const stored = window.localStorage.getItem("aura:backend-url");
    if (
      stored?.includes("127.0.0.1:8787") ||
      stored?.includes("localhost:8787")
    ) {
      window.localStorage.setItem(
        "aura:backend-url",
        JSON.stringify("/api/backend"),
      );
    }
  }, []);

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
      selectedAgentId,
      nimApiKey,
      currency,
      dateFormat,
      setNetwork,
      setCustomRpcUrl,
      setProgramId,
      setBackendUrl,
      setSelectedAgentId,
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
      selectedAgentId,
      setCurrency,
      setCustomRpcUrl,
      setDateFormat,
      setBackendUrl,
      setNetwork,
      setNimApiKey,
      setProgramId,
      setSelectedAgentId,
    ],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

function SolanaProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const settings = AppSettingsContext.useValue();
  const network =
    settings.network === "mainnet-beta"
      ? WalletAdapterNetwork.Mainnet
      : WalletAdapterNetwork.Devnet;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={settings.endpoint}>
        <WalletProvider wallets={wallets} autoConnect={true}>
          <WalletModalProvider>
            <AuthProvider>{children}</AuthProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
      <MotionConfig reducedMotion="user">
        <FaviconSwitcher />
        <AppSettingsProvider>
          <SolanaProviders>{children}</SolanaProviders>
        </AppSettingsProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
