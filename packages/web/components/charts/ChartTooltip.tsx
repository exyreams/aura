interface PayloadEntry {
  name: string;
  value: string | number;
  color: string;
  dataKey?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (active && payload?.length) {
    return (
      <div
        className="rounded px-3 py-2 shadow-xl border"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--border)",
        }}
      >
        {label && (
          <div
            className="mono text-[10px] mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </div>
        )}
        {payload.map((entry) => (
          <div
            key={entry.dataKey || entry.name}
            className="flex items-center gap-2 mono text-[11px]"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span style={{ color: "var(--text-main)" }}>
              {entry.name}:{" "}
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
