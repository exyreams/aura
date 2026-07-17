"use client";

import type React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelAction?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  containerClassName?: string;
  rightAdornment?: React.ReactNode;
  floatingLabel?: boolean;
}

export const Input = ({
  label,
  labelAction,
  error,
  helperText,
  containerClassName,
  rightAdornment,
  floatingLabel = false,
  className,
  id,
  ref,
  onBlur,
  onFocus,
  placeholder,
  value,
  defaultValue,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) => {
  const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;
  const [isFocused, setIsFocused] = useState(false);
  const hasValue =
    value !== undefined && value !== null
      ? String(value).length > 0
      : defaultValue !== undefined && defaultValue !== null
        ? String(defaultValue).length > 0
        : false;
  const isFloating = floatingLabel && (isFocused || hasValue);

  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label && !floatingLabel ? (
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={inputId}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            {label}
          </label>
          {labelAction ? <div className="shrink-0">{labelAction}</div> : null}
        </div>
      ) : labelAction ? (
        <div className="flex min-h-5 items-center justify-end">
          <div className="shrink-0">{labelAction}</div>
        </div>
      ) : null}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          placeholder={floatingLabel ? " " : placeholder}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          className={cn(
            "min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60",
            "focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
            floatingLabel &&
              "min-h-14 px-4 pb-2 pt-6 placeholder:text-transparent",
            rightAdornment && "pr-11",
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
        {label && floatingLabel ? (
          <label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute top-2 left-4 origin-left transition-[transform,color,font-size,letter-spacing] duration-150 ease-out",
              isFloating
                ? "translate-y-0 font-mono text-[10px] uppercase tracking-widest text-primary"
                : "translate-y-3 text-sm text-muted-foreground",
            )}
          >
            {label}
          </label>
        ) : null}
        {rightAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            {rightAdornment}
          </div>
        ) : null}
      </div>
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
