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
import { type ReactNode, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/theme";
import { FaviconSwitcher } from "@/components/theme/FaviconSwitcher";
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
  const [backendAuthToken, setBackendAuthToken] = usePersistentState<string>(
    "aura:backend-auth-token",
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
      backendUrl,
      backendAuthToken,
      nimApiKey,
      currency,
      dateFormat,
      setNetwork,
      setCustomRpcUrl,
      setProgramId,
      setBackendUrl,
      setBackendAuthToken,
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
      backendAuthToken,
      network,
      nimApiKey,
      programId,
      resolvedProgramId,
      setCurrency,
      setCustomRpcUrl,
      setDateFormat,
      setBackendUrl,
      setBackendAuthToken,
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
