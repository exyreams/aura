"use client";

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  label,
  placeholder = "Select option",
  disabled = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={cn("relative grid gap-2", className)}>
      {label ? (
        <span
          id={labelId}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? labelId : undefined}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 truncate",
            !selectedOption && "text-muted-foreground",
          )}
        >
          {selectedOption?.icon ? (
            <span className="shrink-0">{selectedOption.icon}</span>
          ) : null}
          {selectedOption?.label ?? placeholder}
        </span>
        <m.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="shrink-0"
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </m.span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <m.div
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          >
            <div className="max-h-64 overflow-y-auto p-1" role="listbox">
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                    role="option"
                    aria-selected={selected}
                  >
                    {option.icon ? (
                      <span className="shrink-0">{option.icon}</span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.badge ? (
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                        {option.badge}
                      </span>
                    ) : null}
                    {selected ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
