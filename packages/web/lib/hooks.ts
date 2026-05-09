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

export type { AgentIdentity, AgentKeypair, AuthUser } from "@/lib/auth";
export { useAgents, useAuth } from "@/lib/auth";

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
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
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
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
  });
}

export function useBackendInfo() {
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["backend-info", settings.backendUrl],
    queryFn: () =>
      backendRequest<{
        defaultRpcUrl: string;
        defaultProgramId: string;
        allowedOrigins?: string[];
        authEnabled?: boolean;
        auth?: {
          mode: string;
          cookieName: string;
          jwtExpirySecs: number;
        };
        persistence?: {
          sqlite: boolean;
        };
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

// @internal — kept for potential future use; not currently consumed by any component
function useFeatureCatalog() {
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

/**
 * Derives the Metaplex metadata PDA for a given mint.
 * Seeds: ["metadata", METAPLEX_PROGRAM_ID, mint]
 */
function deriveMetadataPda(mint: PublicKey): PublicKey {
  const METAPLEX_PROGRAM_ID = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  );
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METAPLEX_PROGRAM_ID,
  )[0];
}

/**
 * Parses the symbol from a Metaplex metadata account buffer.
 * Layout: 1 (key) + 32 (update_auth) + 32 (mint) + 4+len (name) + 4+len (symbol)
 */
function parseSymbolFromMetadata(data: Buffer): string | null {
  try {
    let offset = 1 + 32 + 32; // key + update_authority + mint
    const nameLen = data.readUInt32LE(offset);
    offset += 4 + nameLen;
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data
      .slice(offset, offset + symbolLen)
      .toString("utf8")
      .replace(/\0/g, "")
      .trim();
    return symbol || null;
  } catch {
    return null;
  }
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  amount: number;
  decimals: number;
  uiAmount: string;
}

export interface DWalletLiveBalance {
  sol: number;
  tokens: TokenBalance[];
}

/**
 * Fetches live SOL + SPL token balances for a dWallet address directly
 * from the RPC. Does not depend on the stored balanceUsd field.
 */
export function useDWalletLiveBalance(address: string | null | undefined) {
  const { connection } = useConnection();
  const settings = useAppSettings();

  return useQuery({
    queryKey: ["dwallet-balance", address, settings.endpoint],
    queryFn: async (): Promise<DWalletLiveBalance> => {
      const pubkey = new PublicKey(address as string);

      // SOL balance
      const lamports = await connection.getBalance(pubkey, "confirmed");
      const sol = lamports / 1e9;

      // SPL token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        pubkey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        },
        "confirmed",
      );

      const tokens: TokenBalance[] = await Promise.all(
        tokenAccounts.value.reduce<typeof tokenAccounts.value>((acc, ta) => {
          const uiAmount = ta.account.data.parsed?.info?.tokenAmount?.uiAmount;
          if (uiAmount && uiAmount > 0) acc.push(ta);
          return acc;
        }, [])
          .map(async (ta) => {
            const info = ta.account.data.parsed?.info;
            const tokenAmount = info?.tokenAmount;
            const mintStr = info.mint as string;

            // Try to fetch the symbol from Metaplex metadata
            let symbol = mintStr.slice(0, 4).toUpperCase();
            try {
              const metadataPda = deriveMetadataPda(new PublicKey(mintStr));
              const metaAccount = await connection.getAccountInfo(
                metadataPda,
                "confirmed",
              );
              if (metaAccount?.data) {
                const parsed = parseSymbolFromMetadata(
                  Buffer.from(metaAccount.data),
                );
                if (parsed) symbol = parsed;
              }
            } catch {
              // fallback to mint prefix
            }

            return {
              mint: mintStr,
              symbol,
              amount: tokenAmount.amount as number,
              decimals: tokenAmount.decimals as number,
              uiAmount: tokenAmount.uiAmountString as string,
            };
          }),
      );

      return { sol, tokens };
    },
    enabled: Boolean(address),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
