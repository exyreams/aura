"use client";

import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/global/Skeleton";

interface DataPoint {
  value: number;
}

interface SparklineProps {
  title: string;
  value: string;
  change?: string;
  changeColor?: string;
  data: DataPoint[];
  color?: string;
  height?: number;
  isLoading?: boolean;
  emptyMessage?: string;
}

interface SparklineTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
}

const SparklineTooltip = ({ active, payload }: SparklineTooltipProps) => {
  if (active && payload?.length) {
    return (
      <div
        className="rounded px-2 py-1 shadow-xl border"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--border)",
        }}
      >
        <span
          className="mono text-[11px]"
          style={{ color: "var(--text-main)" }}
        >
          {payload[0].value}
        </span>
      </div>
    );
  }
  return null;
};

export function Sparkline({
  title,
  value,
  change,
  changeColor = "#10b981",
  data,
  color = "#94a3b8",
  height = 48,
  isLoading = false,
  emptyMessage = "No data available",
}: SparklineProps) {
  const isEmpty = !isLoading && (!data || data.length === 0);

  return (
    <div className="bg-(--card-bg) border border-border rounded p-4 transition-colors outline-none **:outline-none">
      {isLoading ? (
        <>
          <div className="flex justify-between items-start mb-4">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-8 w-24 mb-4" />
          <Skeleton className="h-12 w-full rounded" />
        </>
      ) : isEmpty ? (
        <>
          <div className="flex justify-between items-start mb-4">
            <span className="mono text-[10px] uppercase text-slate-500">
              {title}
            </span>
          </div>
          <div className="text-3xl font-bold mono mb-4 text-(--text-muted)">
            --
          </div>
          <div
            className="flex flex-col items-center justify-center text-center bg-(--card-content) border border-border rounded"
            style={{ height }}
          >
            <span className="text-[10px] text-(--text-muted) mono uppercase">
              {emptyMessage}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between items-start mb-4">
            <span className="mono text-[10px] uppercase text-slate-500">
              {title}
            </span>
            {change && (
              <span
                className="text-[10px] mono font-bold"
                style={{ color: changeColor }}
              >
                {change}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold mono mb-4">{value}</div>
          <ResponsiveContainer width="100%" height={height}>
            <RechartsAreaChart data={data}>
              <defs>
                <linearGradient
                  id={`sparkGradient-${color}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<SparklineTooltip />} />
              <RechartsArea
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#sparkGradient-${color})`}
                dot={false}
              />
            </RechartsAreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
