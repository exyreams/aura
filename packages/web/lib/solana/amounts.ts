export function parseDecimalAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Amount is required.");
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid positive amount.");
  }

  const [whole, fraction = ""] = trimmed.split(".");

  if (fraction.length > decimals) {
    throw new Error(`Use no more than ${decimals} decimal places.`);
  }

  const scale = BigInt(10) ** BigInt(decimals);
  const wholeRaw = BigInt(whole || "0") * scale;
  const fractionRaw = BigInt(fraction.padEnd(decimals, "0") || "0");
  const amount = wholeRaw + fractionRaw;

  if (amount <= BigInt(0)) {
    throw new Error("Amount must be greater than zero.");
  }

  return amount;
}

export function formatRawAmount(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  return `${whole}.${fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")}`;
}
