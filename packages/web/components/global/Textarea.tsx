"use client";

import type React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  helperText?: string;
  containerClassName?: string;
}

export const Textarea = ({
  label,
  error,
  helperText,
  containerClassName,
  className,
  id,
  ref,
  ...props
}: TextareaProps & { ref?: React.Ref<HTMLTextAreaElement> }) => {
  const textareaId =
    id || `textarea-${label?.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={cn("grid gap-2", containerClassName)}>
      {label ? (
        <label
          htmlFor={textareaId}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          "min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60",
          "focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error && "border-danger focus:border-danger",
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? `${textareaId}-error`
            : helperText
              ? `${textareaId}-helper`
              : undefined
        }
        {...props}
      />
      {error ? (
        <p id={`${textareaId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : helperText ? (
        <p
          id={`${textareaId}-helper`}
          className="text-xs text-muted-foreground"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

Textarea.displayName = "Textarea";
