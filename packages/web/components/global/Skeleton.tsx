"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div
      className={cn("rounded-sm animate-pulse", className)}
      style={{
        background:
          "linear-gradient(90deg, var(--skeleton-from) 0%, var(--skeleton-via) 50%, var(--skeleton-to) 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
};
