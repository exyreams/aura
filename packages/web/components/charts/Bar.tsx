"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
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

interface BarConfig {
  dataKey: string;
  label: string;
  lightColor?: string;
  darkColor?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface BarProps {
  title: string;
  description?: string;
  data: DataPoint[];
  xAxisKey: string;
  bars: BarConfig[];
  height?: number;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function Bar({
  title,
  description,
  data,
  xAxisKey,
  bars,
  height = 300,
  isLoading = false,
  emptyMessage = "No data available",
}: BarProps) {
  const [isDark, setIsDark] = useState(true);
  const isEmpty = !isLoading && (!data || data.length === 0);

  useEffect(() => {
    // Check if light theme is active
    const checkTheme = () => {
      setIsDark(!document.documentElement.classList.contains("light"));
    };

    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-(--card-bg) border border-border rounded p-4 md:p-6 hover:border-primary transition-colors outline-none **:outline-none">
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-1">{title}</h3>
        {description && (
          <p className="text-[12px] text-slate-500">{description}</p>
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
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
          <RechartsBarChart data={data}>
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
            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                fill: isDark
                  ? "rgba(255, 255, 255, 0.03)"
                  : "rgba(0, 0, 0, 0.05)",
              }}
            />
            {bars.map((bar) => (
              <RechartsBar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                fill={
                  isDark
                    ? bar.darkColor || "#6B7280"
                    : bar.lightColor || "#334155"
                }
                stroke={bar.stroke}
                strokeWidth={bar.strokeWidth}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
