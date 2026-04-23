"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function SpendingBarChart({
  data,
}: {
  data: Array<{ day: string; spend: number; limit: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="day"
            stroke="#7b91af"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#7b91af"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              background: "rgba(7, 14, 26, 0.94)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              color: "#ecf7ff",
            }}
          />
          <Bar
            dataKey="limit"
            fill="rgba(255,255,255,0.09)"
            radius={[10, 10, 0, 0]}
          />
          <Bar dataKey="spend" fill="#5aa8ff" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgentSpendChart({
  data,
}: {
  data: Array<{ time: string; spend: number; approved: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#7b91af"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#7b91af"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(7, 14, 26, 0.94)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              color: "#ecf7ff",
            }}
          />
          <Line
            type="monotone"
            dataKey="spend"
            stroke="#33f1c5"
            strokeWidth={3}
            dot={{ fill: "#33f1c5", strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: "#5aa8ff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
