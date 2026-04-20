import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function asBigInt(value: unknown): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value);
  }
  if (BN.isBN(value)) {
    return BigInt(value.toString());
  }
  return null;
}

export function formatUsd(value: unknown): string {
  const normalized = asBigInt(value);
  if (normalized === null) {
    return "—";
  }
  return usdFormatter.format(Number(normalized));
}

export function formatPercentBps(value: unknown): string {
  const normalized = asBigInt(value);
  if (normalized === null) {
    return "—";
  }
  return `${(Number(normalized) / 100).toFixed(2)}%`;
}

export function formatPubkey(
  value: PublicKey | string | null | undefined,
  options: { shorten?: boolean } = {},
): string {
  if (!value) {
    return "—";
  }
  const base58 = value instanceof PublicKey ? value.toBase58() : value;
  if (options.shorten === false || base58.length <= 12) {
    return base58;
  }
  return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
}

export function formatTimestamp(value: unknown): string {
  const normalized = asBigInt(value);
  if (normalized === null) {
    return "—";
  }
  const millis = Number(normalized) * 1000;
  return new Date(millis).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelativeSeconds(targetSeconds: unknown): string {
  const normalized = asBigInt(targetSeconds);
  if (normalized === null) {
    return "—";
  }
  const diff = Number(normalized) - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const parts = [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    `${seconds}s`,
  ].filter(Boolean);
  return diff >= 0 ? `in ${parts.join(" ")}` : `${parts.join(" ")} ago`;
}

export function formatNullable(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
