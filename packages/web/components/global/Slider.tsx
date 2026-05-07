"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "defaultValue" | "type" | "size"
  > {
  ref?: Ref<HTMLInputElement>;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  /** Keep existing onChange prop working */
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

export function Slider({
  ref,
  value: valueProp,
  defaultValue,
  onValueChange,
  onValueCommit,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  formatValue = (v: number) => v.toString(),
  disabled = false,
  className,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  ...props
}: SliderProps) {
  const isControlled = valueProp !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? min);
  const value = valueProp ?? internal;

  const reactId = useId();
  const sliderId = id ?? reactId;
  const labelId = `${sliderId}-label`;

  const range = max - min;
  const percentage =
    range > 0 ? Math.min(100, Math.max(0, ((value - min) / range) * 100)) : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
    onChange?.(next);
  };

  const handleCommit = () => {
    onValueCommit?.(value);
  };

  return (
    <div
      className={cn("w-full space-y-2", disabled && "opacity-50", className)}
      data-disabled={disabled || undefined}
    >
      {(label || showValue) && (
        <div className="flex items-center gap-2">
          {label && (
            <label
              id={labelId}
              htmlFor={sliderId}
              className="mono text-[10px] uppercase font-bold text-(--text-muted) select-none"
            >
              {label}
            </label>
          )}
          {showValue && (
            <span className="ml-auto mono text-[11px] text-(--text-main) tabular-nums select-none">
              {formatValue(value)}
            </span>
          )}
        </div>
      )}

      <div className="relative h-4 w-full flex items-center">
        {/* Track */}
        <div className="h-1 w-full bg-(--card-bg) rounded-full overflow-hidden">
          {/* Fill */}
          <div
            className="h-full bg-(--primary)"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Native input */}
        <input
          ref={ref}
          type="range"
          id={sliderId}
          name={name}
          min={min}
          max={max}
          step={step}
          value={value}
          required={required}
          disabled={disabled}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onKeyUp={handleCommit}
          onTouchEnd={handleCommit}
          aria-label={!label ? ariaLabel : undefined}
          aria-labelledby={label ? labelId : undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          data-disabled={disabled || undefined}
          className={cn(
            "absolute inset-0 h-full w-full appearance-none bg-transparent outline-none",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-(--primary)",
            "[&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25)]",
            "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
            !disabled && "[&::-webkit-slider-thumb]:hover:scale-110",
            !disabled && "[&::-webkit-slider-thumb]:active:scale-125",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-(--primary)",
            "[&::-moz-range-thumb]:border-none",
            "[&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25)]",
            "[&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:duration-150",
            !disabled && "[&::-moz-range-thumb]:hover:scale-110",
            !disabled && "[&::-moz-range-thumb]:active:scale-125",
            "[&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-none",
          )}
          {...props}
        />
      </div>
    </div>
  );
}
