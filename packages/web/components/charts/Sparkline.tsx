"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/global/Skeleton";

export const Sparkline = dynamic(
  () => import("./SparklineImpl").then((m) => ({ default: m.Sparkline })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-(--card-bg) border border-border rounded p-4">
        <Skeleton className="h-[120px] w-full rounded" />
      </div>
    ),
  },
);
