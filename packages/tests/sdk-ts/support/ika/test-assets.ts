export interface IkaSplTransferAsset {
  assetId: string;
  symbol: string;
  mint: string;
  defaultDestination: string;
  defaultAmountUi: string;
}

export const IKA_TEST_USDC: IkaSplTransferAsset = {
  assetId: "usdc",
  symbol: "USDC",
  mint: "HoKKM1GdwcWybxE9hu6duUeQqrZV2tDVssrzSozydP3R",
  defaultDestination: "6373kE2DJqd91itcw3mKj6gSLPLkuMPgmd7YgVkWg8oZ",
  defaultAmountUi: "100",
};
