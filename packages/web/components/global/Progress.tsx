"use client";

import { motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
  animate?: boolean;
  size?: "small" | "medium" | "large";
}

const sizeClasses = {
  small: "h-1",
  medium: "h-1.5",
  large: "h-2",
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  className,
  animate = true,
  size = "medium",
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn("space-y-3", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between mono text-[10px] text-slate-400">
          {label && <span>{label}</span>}
          {showPercentage && <span>{Math.round(percentage)}%</span>}
        </div>
      )}
      <div
        className={cn(
          "w-full bg-white/5 border border-white/5 overflow-hidden rounded-[1px]",
          sizeClasses[size],
        )}
      >
        <motion.div
          initial={animate ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-linear-to-r from-slate-700 to-slate-400"
        />
      </div>
    </div>
  );
};
