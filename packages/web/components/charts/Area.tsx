"use client";

import {
  CartesianGrid,
  Line,
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/global/Skeleton";
import { ChartTooltip } from "./ChartTooltip";

interface DataPoint {
  [key: string]: string | number;
}

interface AreaProps {
  title: string;
  description?: string;
  data: DataPoint[];
  xAxisKey: string;
  areas?: {
    dataKey: string;
    color: string;
    label: string;
  }[];
  lines?: {
    dataKey: string;
    color: string;
    label: string;
    dashed?: boolean;
  }[];
  height?: number;
  showLegend?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function Area({
  title,
  description,
  data,
  xAxisKey,
  areas = [],
  lines = [],
  height = 300,
  showLegend = true,
  isLoading = false,
  emptyMessage = "No data available",
}: AreaProps) {
  const isEmpty = !isLoading && (!data || data.length === 0);

  return (
    <div className="bg-(--card-bg) border border-border rounded p-4 md:p-6 hover:border-primary transition-colors outline-none **:outline-none">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
        <div>
          <h3 className="text-xl font-bold mb-1">{title}</h3>
          {description && (
            <p className="text-[12px] text-slate-500">{description}</p>
          )}
        </div>
        {showLegend &&
          !isLoading &&
          !isEmpty &&
          (areas.length > 0 || lines.length > 0) && (
            <div className="flex gap-4">
              {lines.map((line) => (
                <div key={line.dataKey} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="mono text-[10px] uppercase text-slate-400">
                    {line.label}
                  </span>
                </div>
              ))}
              {areas.map((area) => (
                <div key={area.dataKey} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="mono text-[10px] uppercase text-slate-400">
                    {area.label}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>

      {isLoading ? (
        <div className="space-y-3" style={{ height }}>
          <Skeleton className="h-full w-full rounded" />
        </div>
      ) : isEmpty ? (
        <div
          className="flex flex-col items-center justify-center text-center p-6 bg-(--card-content) border border-border rounded"
          style={{ height }}
        >
          <div className="w-12 h-12 bg-(--card-bg) rounded-full flex items-center justify-center mb-4 opacity-50">
            <svg
              className="w-6 h-6 text-(--text-muted)"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="No data icon"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
          </div>
          <span className="text-sm text-(--text-main) font-medium mb-1">
            No Data Available
          </span>
          <p className="text-[10px] text-(--text-muted) mono uppercase max-w-[200px]">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <RechartsAreaChart data={data}>
            <defs>
              {areas.map((area) => (
                <linearGradient
                  key={`gradient-${area.dataKey}`}
                  id={`gradient-${area.dataKey}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={area.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={area.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="0"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey={xAxisKey}
              stroke="#6B7280"
              style={{ fontSize: "10px", fontFamily: "monospace" }}
            />
            <YAxis
              stroke="#6B7280"
              style={{ fontSize: "10px", fontFamily: "monospace" }}
            />
            <Tooltip content={<ChartTooltip />} />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                strokeWidth={2}
                strokeDasharray={line.dashed ? "8 4" : undefined}
                dot={false}
              />
            ))}
            {areas.map((area) => (
              <RechartsArea
                key={area.dataKey}
                type="monotone"
                dataKey={area.dataKey}
                stroke={area.color}
                strokeWidth={3}
                fill={`url(#gradient-${area.dataKey})`}
                dot={false}
              />
            ))}
          </RechartsAreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
