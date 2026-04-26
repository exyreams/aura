import { Bar } from "@/components/charts/Bar";

interface Treasury {
  agentId: string;
  dailyLimit: number;
  spentToday: number;
}

interface SpendingChartProps {
  data: Treasury[];
}

export function SpendingChart({ data }: SpendingChartProps) {
  // Transform treasury data for the Bar chart component
  const chartData = data.slice(0, 7).map((treasury) => {
    const agentId = treasury.agentId || "Unknown";
    const shortLabel = agentId
      .split("-")
      .map((part, i) => (i === 0 ? part.slice(0, 8) : part))
      .join("-")
      .toUpperCase();

    return {
      name: shortLabel,
      spent: treasury.spentToday || 0,
      limit: treasury.dailyLimit || 0,
    };
  });

  return (
    <section className="mb-12">
      <Bar
        title="Spending Chart"
        description="Current spent-today versus daily limit for each connected treasury."
        data={chartData}
        xAxisKey="name"
        bars={[
          {
            dataKey: "spent",
            label: "Current Spend (USD)",
            darkColor: "#9ca3b0",
            lightColor: "#6b7280",
          },
          {
            dataKey: "limit",
            label: "Daily Limit (USD)",
            darkColor: "rgba(255, 255, 255, 0.1)",
            lightColor: "rgba(0, 0, 0, 0.1)",
            stroke: "rgba(255, 255, 255, 0.2)",
            strokeWidth: 1,
          },
        ]}
        height={300}
      />
    </section>
  );
}
