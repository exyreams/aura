import { PublicKey } from "@solana/web3.js";
import { DEVNET_AVAILABLE } from "../devnet.js";

export const LIVE_SCENARIOS_ENABLED =
  process.env.AURA_LIVE_SCENARIOS_TEST === "1" ||
  process.env.AURA_LIVE_FUNDS_TEST === "1";

export const liveScenarioSkip = !DEVNET_AVAILABLE
  ? "no devnet payer keypair"
  : LIVE_SCENARIOS_ENABLED
    ? false
    : "set AURA_LIVE_SCENARIOS_TEST=1 to move live devnet funds";

export const discoverySkip = !DEVNET_AVAILABLE
  ? "no devnet payer keypair"
  : false;

export const DEFAULT_RECIPIENT_OWNER = new PublicKey(
  process.env.AURA_LIVE_RECIPIENT_OWNER ??
    "HANEmsh97jpuwrAWdqeCigzdquesiYVLxCPpfcPaEe72",
);

export const DEFAULT_TRANSFER_UI = process.env.AURA_LIVE_TRANSFER_UI ?? "1";
export const MAX_TRANSFER_UI = process.env.AURA_LIVE_MAX_TRANSFER_UI ?? "10";
export const BOOTSTRAP_SOURCE_UI =
  process.env.AURA_LIVE_DWALLET_BOOTSTRAP_UI ?? "20";
export const MIN_DWALLET_FEE_LAMPORTS = Number(
  process.env.AURA_LIVE_DWALLET_MIN_FEE_LAMPORTS ?? "20000000",
);
