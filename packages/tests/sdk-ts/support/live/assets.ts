import {
  ExtensionType,
  getAccount,
  getAssociatedTokenAddressSync,
  getExtensionTypes,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { connection } from "../devnet.js";

export const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

export interface TokenBalanceSnapshot {
  amount: bigint;
  uiAmountString: string;
  decimals: number;
}

export interface LiveTokenAsset {
  mint: PublicKey;
  tokenProgramId: PublicKey;
  payerTokenAccount: PublicKey;
  decimals: number;
  amount: bigint;
  uiAmountString: string;
  assetId: string;
  symbol: string;
  extensions: string[];
  extensionTypes: ExtensionType[];
  transferCompatible: boolean;
  hookAwareTransferCompatible: boolean;
  unsupportedReason: string | null;
}

export function uiAmountToRaw(ui: string, decimals: number): bigint {
  const [whole, fraction = ""] = ui.split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function rawAmountToUi(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function rawTokenAmountToUsdCents(raw: bigint, decimals: number): BN {
  const scale = 10n ** BigInt(decimals);
  const cents = (raw * 100n) / scale;
  return new BN(cents.toString());
}

function transferCompatibilityForExtensions(extensions: ExtensionType[]): {
  transferCompatible: boolean;
  hookAwareTransferCompatible: boolean;
  unsupportedReason: string | null;
} {
  const standardAllowed = new Set([
    ExtensionType.MintCloseAuthority,
    ExtensionType.MetadataPointer,
    ExtensionType.TokenMetadata,
  ]);
  const hookAwareAllowed = new Set([
    ...standardAllowed,
    ExtensionType.PermanentDelegate,
    ExtensionType.TransferHook,
  ]);
  const standardUnsupported = extensions.filter(
    (extension) => !standardAllowed.has(extension),
  );
  const hookAwareUnsupported = extensions.filter(
    (extension) => !hookAwareAllowed.has(extension),
  );
  const unsupportedReason =
    hookAwareUnsupported.length === 0
      ? null
      : hookAwareUnsupported
          .map((extension) => ExtensionType[extension] ?? String(extension))
          .join(",");
  return {
    transferCompatible: standardUnsupported.length === 0,
    hookAwareTransferCompatible: hookAwareUnsupported.length === 0,
    unsupportedReason,
  };
}

export function tokenAta(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgramId: PublicKey,
): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, tokenProgramId);
}

export async function mintDecimals(
  mint: PublicKey,
  tokenProgramId: PublicKey,
): Promise<number> {
  return (await getMint(connection(), mint, "confirmed", tokenProgramId))
    .decimals;
}

export async function readTokenBalance(
  tokenAccount: PublicKey,
  tokenProgramId: PublicKey,
): Promise<TokenBalanceSnapshot> {
  if (!(await connection().getAccountInfo(tokenAccount, "confirmed"))) {
    return { amount: 0n, uiAmountString: "0", decimals: 0 };
  }
  const account = await getAccount(
    connection(),
    tokenAccount,
    "confirmed",
    tokenProgramId,
  );
  const decimals = await mintDecimals(account.mint, tokenProgramId);
  return {
    amount: account.amount,
    uiAmountString: rawAmountToUi(account.amount, decimals),
    decimals,
  };
}

export async function discoverLiveTokenAssets(
  owner: PublicKey,
): Promise<LiveTokenAsset[]> {
  const candidates: LiveTokenAsset[] = [];
  for (const tokenProgramId of TOKEN_PROGRAMS) {
    const { value } = await connection().getParsedTokenAccountsByOwner(owner, {
      programId: tokenProgramId,
    });
    for (const { pubkey, account } of value) {
      if (typeof account.data === "string") continue;
      const info = account.data.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      if (!info?.mint || !tokenAmount?.amount) continue;
      const amount = BigInt(tokenAmount.amount);
      if (amount <= 0n) continue;
      const mint = await getMint(
        connection(),
        new PublicKey(info.mint),
        "confirmed",
        tokenProgramId,
      );
      const extensionTypes = getExtensionTypes(mint.tlvData);
      const compatibility = transferCompatibilityForExtensions(extensionTypes);
      candidates.push({
        mint: mint.address,
        tokenProgramId,
        payerTokenAccount: pubkey,
        decimals: Number(tokenAmount.decimals),
        amount,
        uiAmountString:
          tokenAmount.uiAmountString ??
          rawAmountToUi(amount, Number(tokenAmount.decimals)),
        assetId: mint.address.toBase58(),
        symbol: "TOKEN",
        extensions: extensionTypes.map(
          (extension) => ExtensionType[extension] ?? String(extension),
        ),
        extensionTypes,
        ...compatibility,
      });
    }
  }

  candidates.sort((a, b) => {
    const byUi =
      b.amount * 10n ** BigInt(a.decimals) -
      a.amount * 10n ** BigInt(b.decimals);
    if (byUi !== 0n) return byUi > 0n ? 1 : -1;
    return a.mint.toBase58().localeCompare(b.mint.toBase58());
  });

  return candidates;
}

export async function discoverLiveTokenAsset(
  owner: PublicKey,
): Promise<LiveTokenAsset> {
  const candidates = await discoverLiveTokenAssets(owner);
  printTokenCandidateReport(candidates);
  if (candidates.length === 0) {
    throw new Error(
      [
        "payer wallet has no nonzero SPL or Token-2022 balances to use",
        `payer: ${owner.toBase58()}`,
        "fund the payer with the test token, then re-run the live scenario suite",
      ].join("\n"),
    );
  }
  const selected = candidates.find(
    (candidate) => candidate.hookAwareTransferCompatible,
  );
  if (!selected) {
    throw new Error(
      [
        "payer wallet has token balances, but none are compatible with the live scenario transfer helpers",
        ...candidates.map(
          (candidate) =>
            `${candidate.mint.toBase58()}: ${candidate.unsupportedReason ?? "unknown"}`,
        ),
      ].join("\n"),
    );
  }
  return selected;
}

export function printTokenCandidateReport(candidates: LiveTokenAsset[]): void {
  console.log("\n=== live scenario token candidates ===");
  for (const candidate of candidates) {
    const compatibility = candidate.hookAwareTransferCompatible
      ? candidate.transferCompatible
        ? "standard-transfer compatible"
        : "hook-aware transfer compatible"
      : `skip: ${candidate.unsupportedReason}`;
    console.log(
      `${candidate.uiAmountString} @ ${candidate.mint.toBase58()} (${candidate.tokenProgramId.toBase58()}) [${compatibility}] extensions=${candidate.extensions.join(",") || "none"}`,
    );
  }
}

export function pickTransferAmountRaw(
  balance: bigint,
  decimals: number,
  defaultTransferUi: string,
  maxTransferUi: string,
): bigint {
  const oneUnit = uiAmountToRaw(defaultTransferUi, decimals);
  const cap = uiAmountToRaw(maxTransferUi, decimals);
  const onePercent = balance / 100n;
  const candidate = onePercent > oneUnit ? onePercent : oneUnit;
  const amount = candidate < cap ? candidate : cap;
  if (amount <= 0n || amount >= balance) {
    throw new Error(
      `insufficient live scenario balance: ${rawAmountToUi(balance, decimals)}`,
    );
  }
  return amount;
}
