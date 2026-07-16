export interface TokenMetadata {
  mint: string;
  name: string | null;
  symbol: string | null;
  icon: string | null;
  decimals: number | null;
  tokenProgram: string | null;
}

interface JupiterTokenSearchResult {
  id?: unknown;
  name?: unknown;
  symbol?: unknown;
  icon?: unknown;
  decimals?: unknown;
  tokenProgram?: unknown;
}

const JUPITER_TOKEN_SEARCH_URL = "https://lite-api.jup.ag/tokens/v2/search";
const metadataCache = new Map<string, TokenMetadata | null>();

function normalizeMetadata(
  value: JupiterTokenSearchResult,
): TokenMetadata | null {
  if (typeof value.id !== "string") {
    return null;
  }

  return {
    mint: value.id,
    name: typeof value.name === "string" ? value.name : null,
    symbol: typeof value.symbol === "string" ? value.symbol : null,
    icon: typeof value.icon === "string" ? value.icon : null,
    decimals: typeof value.decimals === "number" ? value.decimals : null,
    tokenProgram:
      typeof value.tokenProgram === "string" ? value.tokenProgram : null,
  };
}

async function fetchTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  if (metadataCache.has(mint)) {
    return metadataCache.get(mint) ?? null;
  }

  try {
    const url = new URL(JUPITER_TOKEN_SEARCH_URL);
    url.searchParams.set("query", mint);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      metadataCache.set(mint, null);
      return null;
    }

    const data = (await response.json()) as unknown;
    const tokens = Array.isArray(data) ? data : [];
    const exact = tokens
      .map((token) => normalizeMetadata(token as JupiterTokenSearchResult))
      .find((token): token is TokenMetadata => token?.mint === mint);

    metadataCache.set(mint, exact ?? null);
    return exact ?? null;
  } catch {
    metadataCache.set(mint, null);
    return null;
  }
}

export async function getTokenMetadataMap(mints: string[]) {
  const uniqueMints = Array.from(new Set(mints.filter(Boolean)));
  const entries = await Promise.all(
    uniqueMints.map(
      async (mint) => [mint, await fetchTokenMetadata(mint)] as const,
    ),
  );

  return new Map(
    entries.flatMap(([mint, metadata]) => (metadata ? [[mint, metadata]] : [])),
  );
}
