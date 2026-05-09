"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/global/Skeleton";

export const Bar = dynamic(
  () => import("./BarImpl").then((m) => ({ default: m.Bar })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-(--card-bg) border border-border rounded p-4 md:p-6">
        <Skeleton className="h-[300px] w-full rounded" />
      </div>
    ),
  },
);
