import {
  type Connection,
  LAMPORTS_PER_SOL,
  type ParsedAccountData,
  PublicKey,
} from "@solana/web3.js";
import { getTokenMetadataMap } from "@/lib/solana/token-metadata";

export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPF1nS6pMaMczG7wv8JK",
);

export interface NativeSolBalance {
  kind: "native";
  symbol: "SOL";
  amount: number;
  lamports: number;
}

export interface TokenBalance {
  kind: "token";
  tokenProgram: string;
  tokenAccount: string;
  mint: string;
  symbol: string;
  name: string | null;
  logoURI: string | null;
  decimals: number;
  amount: number;
  rawAmount: string;
}

export interface SolanaWalletBalances {
  address: string;
  native: NativeSolBalance;
  tokens: TokenBalance[];
  warnings: SolanaWalletBalanceWarning[];
  refreshedAt: string;
}

export interface SolanaWalletBalanceWarning {
  code: "token_2022_unavailable";
  message: string;
}

interface OptionalTokenProgramBalances {
  tokens: TokenBalance[];
  warnings: SolanaWalletBalanceWarning[];
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown RPC error";
}

function isUnrecognizedTokenProgramError(error: unknown) {
  return errorMessage(error)
    .toLowerCase()
    .includes("unrecognized token program id");
}

function parseTokenBalance(
  tokenProgram: PublicKey,
  tokenAccount: string,
  data: ParsedAccountData,
): TokenBalance | null {
  const info = data.parsed?.info;
  const tokenAmount = info?.tokenAmount;

  if (!info?.mint || !tokenAmount?.amount) {
    return null;
  }

  const decimals = Number(tokenAmount.decimals ?? 0);
  const amount =
    typeof tokenAmount.uiAmount === "number"
      ? tokenAmount.uiAmount
      : Number(tokenAmount.amount) / 10 ** decimals;
  const mint = String(info.mint);

  return {
    kind: "token",
    tokenProgram: tokenProgram.toBase58(),
    tokenAccount,
    mint,
    symbol: mint.slice(0, 4).toUpperCase(),
    name: null,
    logoURI: null,
    decimals,
    amount,
    rawAmount: String(tokenAmount.amount),
  };
}

async function fetchTokenProgramBalances(
  connection: Connection,
  owner: PublicKey,
  tokenProgram: PublicKey,
) {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: tokenProgram,
  });

  return accounts.value.flatMap(({ pubkey, account }) => {
    const data = account.data;
    if (!("parsed" in data)) {
      return [];
    }

    const parsed = parseTokenBalance(tokenProgram, pubkey.toBase58(), data);
    return parsed && parsed.rawAmount !== "0" ? [parsed] : [];
  });
}

async function fetchOptionalToken2022Balances(
  connection: Connection,
  owner: PublicKey,
): Promise<OptionalTokenProgramBalances> {
  try {
    return {
      tokens: await fetchTokenProgramBalances(
        connection,
        owner,
        TOKEN_2022_PROGRAM_ID,
      ),
      warnings: [],
    };
  } catch (error) {
    if (!isUnrecognizedTokenProgramError(error)) {
      throw error;
    }

    return {
      tokens: [],
      warnings: [
        {
          code: "token_2022_unavailable",
          message:
            "Token-2022 balances are unavailable from this RPC. Native SOL and SPL token balances are still shown.",
        },
      ],
    };
  }
}

export async function fetchSolanaWalletBalances(
  connection: Connection,
  address: string,
): Promise<SolanaWalletBalances> {
  const owner = new PublicKey(address);
  const [lamports, splTokens, token2022Result] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    fetchTokenProgramBalances(connection, owner, SPL_TOKEN_PROGRAM_ID),
    fetchOptionalToken2022Balances(connection, owner),
  ]);
  const tokens = [...splTokens, ...token2022Result.tokens].sort((a, b) =>
    a.mint.localeCompare(b.mint),
  );
  const metadataMap = await getTokenMetadataMap(
    tokens.map((token) => token.mint),
  );

  return {
    address,
    native: {
      kind: "native",
      symbol: "SOL",
      amount: lamports / LAMPORTS_PER_SOL,
      lamports,
    },
    warnings: token2022Result.warnings,
    tokens: tokens.map((token) => {
      const metadata = metadataMap.get(token.mint);

      if (!metadata) {
        return token;
      }

      return {
        ...token,
        symbol: metadata.symbol || token.symbol,
        name: metadata.name || token.name,
        logoURI: metadata.icon || token.logoURI,
      };
    }),
    refreshedAt: new Date().toISOString(),
  };
}
