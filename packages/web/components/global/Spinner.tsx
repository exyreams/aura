"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeClasses = {
  small: "w-6 h-6",
  medium: "w-10 h-10",
  large: "w-14 h-14",
};

const strokeWidths = {
  small: 3,
  medium: 5,
  large: 6,
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = "medium",
  className,
}) => {
  const strokeWidth = strokeWidths[size];

  return (
    <div
      className={cn(
        "inline-block spinner-container",
        sizeClasses[size],
        className,
      )}
    >
      <svg
        viewBox="0 0 50 50"
        className={cn("w-full h-full", sizeClasses[size])}
        aria-label="Loading spinner"
      >
        <title>Loading</title>
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="spinner-circle"
        />
      </svg>
    </div>
  );
};
