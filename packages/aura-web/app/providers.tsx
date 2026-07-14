"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { OwnerAuthProvider } from "@/components/auth/OwnerAuthProvider";
import { FaviconSwitcher } from "@/components/theme/FaviconSwitcher";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import {
  AppSettingsContext,
  type AppSettingsContextValue,
  DEFAULT_AURA_PROGRAM_ID,
  usePersistentState,
} from "@/lib/settings";

function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = usePersistentState<"devnet" | "mainnet-beta">(
    "aura:network",
    "devnet",
  );
  const [customRpcUrl, setCustomRpcUrl] = usePersistentState<string>(
    "aura:custom-rpc-url",
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "",
  );
  const [programId, setProgramId] = usePersistentState<string>(
    "aura:program-id",
    DEFAULT_AURA_PROGRAM_ID,
  );
  const [selectedAgentId, setSelectedAgentId] = usePersistentState<string>(
    "aura:selected-agent-id",
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
      selectedAgentId,
      currency,
      dateFormat,
      setNetwork,
      setCustomRpcUrl,
      setProgramId,
      setSelectedAgentId,
      setCurrency,
      setDateFormat,
    }),
    [
      currency,
      customRpcUrl,
      dateFormat,
      endpoint,
      network,
      programId,
      resolvedProgramId,
      selectedAgentId,
      setCurrency,
      setCustomRpcUrl,
      setDateFormat,
      setNetwork,
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

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={settings.endpoint}>
        <WalletProvider wallets={[]} autoConnect={false}>
          <OwnerAuthProvider>{children}</OwnerAuthProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem={true}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation}>
          <FaviconSwitcher />
          <AppSettingsProvider>
            <SolanaProviders>{children}</SolanaProviders>
          </AppSettingsProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
