export const AURA_CHAINS = [
  { id: 0, name: "Bitcoin", supportsLiveBalance: false },
  { id: 1, name: "Ethereum", supportsLiveBalance: false },
  { id: 2, name: "Solana", supportsLiveBalance: true },
  { id: 3, name: "Polygon", supportsLiveBalance: false },
  { id: 4, name: "Arbitrum", supportsLiveBalance: false },
  { id: 5, name: "Optimism", supportsLiveBalance: false },
] as const;

export const SOLANA_CHAIN_ID = 2;

export function getChainName(chainId: number) {
  return (
    AURA_CHAINS.find((chain) => chain.id === chainId)?.name ??
    `Chain ${chainId}`
  );
}
