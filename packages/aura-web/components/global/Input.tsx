"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelAction?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  containerClassName?: string;
}

export const Input = ({
  label,
  labelAction,
  error,
  helperText,
  containerClassName,
  className,
  id,
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label ? (
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={inputId}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            {label}
          </label>
          {labelAction ? <div className="shrink-0">{labelAction}</div> : null}
        </div>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60",
          "focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error && "border-danger focus:border-danger",
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `${inputId}-error`
            : helperText
              ? `${inputId}-helper`
              : undefined
        }
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

Input.displayName = "Input";
