import type React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return <div className={cn("rounded-sm skeleton-shimmer", className)} />;
};
