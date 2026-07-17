"use client";

import { Check } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked = false,
  onChange,
  label,
  children,
  disabled = false,
  className,
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-3",
        disabled && "cursor-not-allowed",
        disabled && (checked ? "opacity-80" : "opacity-60"),
        className,
      )}
    >
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
          disabled={disabled}
          className={cn(
            "peer size-5 appearance-none rounded-sm border bg-background transition-colors",
            checked ? "border-primary bg-primary" : "border-border",
            !disabled &&
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            disabled && "cursor-not-allowed",
          )}
        />
        <AnimatePresence>
          {checked ? (
            <m.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="pointer-events-none absolute"
            >
              <Check className="size-3.5 text-background" aria-hidden="true" />
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
      {children ?? (
        <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
          {label}
        </span>
      )}
    </label>
  );
}
