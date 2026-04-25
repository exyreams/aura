"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  formatValue = (v) => v.toString(),
  className,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(Number(e.target.value));
  };

  const percentage = ((value - min) / (max - min)) * 100;
  const sliderId = `slider-${label?.toLowerCase().replace(/\s+/g, "-") || "default"}`;

  return (
    <div className={cn("space-y-4", className)}>
      {(label || showValue) && (
        <div className="flex justify-between">
          {label && (
            <label
              htmlFor={sliderId}
              className="mono text-[10px] uppercase text-(--text-muted) font-bold"
            >
              {label}
            </label>
          )}
          {showValue && (
            <span className="mono text-[11px] text-(--text-main)">
              {formatValue(value)}
            </span>
          )}
        </div>
      )}
      <div className="relative w-full h-1 bg-(--card-bg) rounded-sm">
        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 h-full bg-primary rounded-sm transition-all duration-150"
          style={{ width: `${percentage}%` }}
        />
        {/* Actual input */}
        <input
          type="range"
          id={sliderId}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
};
