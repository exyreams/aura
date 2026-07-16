export function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function fail(message: string, json: boolean, code = 1): never {
  if (json) {
    emitJson({ ok: false, error: message });
  } else {
    process.stderr.write(`! ${message}\n`);
  }
  process.exit(code);
}

export function printRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  options: { header?: ReadonlyArray<string> } = {},
): void {
  const allRows = options.header ? [options.header, ...rows] : [...rows];
  const widths: number[] = [];
  for (const row of allRows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  if (options.header) {
    process.stdout.write(formatRow(options.header, widths));
    process.stdout.write(`${widths.map((w) => "-".repeat(w)).join("  ")}\n`);
  }
  for (const row of rows) {
    process.stdout.write(formatRow(row, widths));
  }
}

function formatRow(row: ReadonlyArray<string>, widths: ReadonlyArray<number>) {
  return `${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}\n`;
}
