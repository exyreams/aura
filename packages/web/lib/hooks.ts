"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  createAuraClient,
  fetchOwnedTreasuries,
  fetchRecentActivity,
  fetchTreasury,
  type TreasuryEntry,
} from "@/lib/aura-app";
import { backendRequest } from "@/lib/backend-client";
import { AppSettingsContext } from "@/lib/settings";

export function useAppSettings() {
  return AppSettingsContext.useValue();
}

export function useAuraClient() {
  const { connection } = useConnection();
  const settings = useAppSettings();

  return useMemo(
    () => createAuraClient(connection, settings.resolvedProgramId),
    [connection, settings.resolvedProgramId],
  );
}

export function useOwnedTreasuries() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const settings = useAppSettings();

  return useQuery({
    queryKey: [
      "treasuries",
      publicKey?.toBase58(),
      settings.endpoint,
      settings.programId,
    ],
    queryFn: () =>
      fetchOwnedTreasuries(
        connection,
        publicKey as PublicKey,
        settings.resolvedProgramId,
      ),
    enabled: Boolean(publicKey),
  });
}

export function useTreasury(treasury: string | undefined) {
  const { connection } = useConnection();
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["treasury", treasury, settings.endpoint, settings.programId],
    queryFn: () =>
      fetchTreasury(
        connection,
        new PublicKey(treasury as string),
        settings.resolvedProgramId,
      ),
    enabled: Boolean(treasury),
  });
}

export function useRecentActivity(treasuries: TreasuryEntry[]) {
  const { connection } = useConnection();
  const settings = useAppSettings();

  return useQuery({
    queryKey: [
      "recent-activity",
      treasuries.map((entry) => entry.publicKey.toBase58()).join(","),
      settings.endpoint,
      settings.programId,
    ],
    queryFn: () =>
      fetchRecentActivity(
        connection,
        treasuries.map((entry) => entry.publicKey),
        settings.resolvedProgramId,
      ),
    enabled: treasuries.length > 0,
  });
}

export function useBackendInfo() {
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["backend-info", settings.backendUrl],
    queryFn: () =>
      backendRequest<{
        publicKey: string;
        defaultRpcUrl: string;
        defaultProgramId: string;
      }>(settings.backendUrl, "/v1/service/info"),
    retry: 1,
  });
}

export type { TreasuryEntry };
