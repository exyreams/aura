"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
  size?: "xs" | "small" | "medium" | "large";
  className?: string;
}

const sizeClasses = {
  xs: "size-3.5",
  small: "size-6",
  medium: "size-10",
  large: "size-14",
};

const strokeWidths = {
  xs: 4,
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
