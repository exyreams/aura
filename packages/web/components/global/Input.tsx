import { Minus, Plus } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  showIncrement?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      prefix,
      suffix,
      showIncrement,
      onIncrement,
      onDecrement,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) mono text-xs">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main)",
              "focus:border-primary",
              error && "border-danger focus:border-danger",
              prefix && "pl-8",
              suffix && "pr-12",
              showIncrement && "pr-20",
              className,
            )}
            {...props}
          />
          {suffix && !showIncrement && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) mono text-[10px]">
              {suffix}
            </span>
          )}
          {showIncrement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={onDecrement}
                className="w-6 h-6 flex items-center justify-center border border-border rounded-sm bg-(--card-bg) hover:bg-(--hover-bg) transition-colors text-(--text-muted) hover:text-(--text-main)"
              >
                <Minus size={12} />
              </button>
              <button
                type="button"
                onClick={onIncrement}
                className="w-6 h-6 flex items-center justify-center border border-border rounded-sm bg-(--card-bg) hover:bg-(--hover-bg) transition-colors text-(--text-muted) hover:text-(--text-main)"
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
        {error && <span className="text-[10px] text-danger mono">{error}</span>}
      </div>
    );
  },
);

Input.displayName = "Input";
