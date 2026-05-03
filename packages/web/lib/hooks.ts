"use client";

import {
  AURA_FEATURE_DOMAINS,
  type AuraFeatureDomain,
} from "@aura-protocol/sdk-ts";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  createAuraClient,
  fetchOwnedTreasuries,
  fetchRecentActivity,
  fetchTreasury,
  type ParsedActivity,
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

export function useTreasuryAuditTrail(
  treasuryPda: string | undefined,
  limit = 20,
) {
  const { connection } = useConnection();
  const settings = useAppSettings();

  return useQuery({
    queryKey: [
      "audit-trail",
      treasuryPda,
      settings.endpoint,
      settings.programId,
      limit,
    ],
    queryFn: () =>
      fetchRecentActivity(
        connection,
        [new PublicKey(treasuryPda as string)],
        settings.resolvedProgramId,
        limit,
      ),
    enabled: Boolean(treasuryPda),
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
        sdkSurface?: {
          domains: number;
          instructions: number;
        };
      }>(settings.backendUrl, "/v1/service/info"),
    retry: 1,
  });
}

export interface FeatureCatalogResponse {
  domains: AuraFeatureDomain[];
  totals: {
    domains: number;
    instructions: number;
  };
}

export interface InstructionAccountSchema {
  name: string;
  camelName: string;
  signer: boolean;
  writable: boolean;
  optional: boolean;
  address?: string;
}

export interface InstructionArgSchema {
  name: string;
  camelName: string;
  type: unknown;
  typeLabel: string;
  sample: unknown;
}

export interface ProgramInstructionSchema {
  name: string;
  camelName: string;
  accounts: InstructionAccountSchema[];
  args: InstructionArgSchema[];
}

export interface InstructionCatalogResponse {
  domains: Array<
    Omit<AuraFeatureDomain, "instructions"> & {
      instructions: Array<
        AuraFeatureDomain["instructions"][number] & {
          schema: ProgramInstructionSchema | null;
        }
      >;
    }
  >;
  totals: {
    domains: number;
    instructions: number;
  };
}

export interface SerializedInstruction {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
}

export interface InstructionBuildResponse {
  schema: ProgramInstructionSchema;
  normalizedAccounts: Record<string, unknown>;
  normalizedArgs: unknown[];
  instruction: SerializedInstruction;
  requiredSigners: string[];
}

const localFeatureCatalog: FeatureCatalogResponse = {
  domains: AURA_FEATURE_DOMAINS,
  totals: {
    domains: AURA_FEATURE_DOMAINS.length,
    instructions: AURA_FEATURE_DOMAINS.reduce(
      (total, domain) => total + domain.instructions.length,
      0,
    ),
  },
};

export function useFeatureCatalog() {
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["feature-catalog", settings.backendUrl],
    queryFn: () =>
      backendRequest<FeatureCatalogResponse>(
        settings.backendUrl,
        "/v1/features/catalog",
      ),
    placeholderData: localFeatureCatalog,
    retry: 1,
    staleTime: 60_000,
  });
}

export function useInstructionCatalog() {
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["instruction-catalog", settings.backendUrl],
    queryFn: () =>
      backendRequest<InstructionCatalogResponse>(
        settings.backendUrl,
        "/v1/instructions/catalog",
      ),
    retry: 1,
    staleTime: 60_000,
  });
}

export type { ParsedActivity, TreasuryEntry };
