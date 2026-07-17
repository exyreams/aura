export function formatTokenAmount(
  amount: number,
  options: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  } = {},
) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: options.maximumFractionDigits ?? 6,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(amount);
}

export function formatSol(amount: number) {
  return `${formatTokenAmount(amount, { maximumFractionDigits: 6 })} SOL`;
}
