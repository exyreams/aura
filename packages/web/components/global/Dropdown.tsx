"use client";

import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/global/Badge";
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
  placeholder?: string;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select option",
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={handleToggle}
        className="bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main) flex items-center justify-between text-left focus:border-(--text-muted)"
      >
        <span
          className={cn(
            "flex items-center gap-2",
            !selectedOption && "text-(--text-muted)",
          )}
        >
          {selectedOption?.icon && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          {selectedOption?.label || placeholder}
        </span>
        <m.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronDown className="size-4 text-(--text-muted)" />
        </m.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 w-full mt-2 bg-(--bg) border border-border rounded-sm shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs rounded-sm flex items-center gap-2",
                    option.value === value
                      ? "bg-primary text-(--bg) font-semibold"
                      : "text-(--text-main) hover:bg-(--hover-bg)",
                  )}
                >
                  {option.icon && (
                    <span className="shrink-0 text-base">{option.icon}</span>
                  )}
                  <span className="flex-1">{option.label}</span>
                  {option.badge && (
                    <Badge variant="on-primary" className="shrink-0">
                      {option.badge}
                    </Badge>
                  )}
                  {option.value === value && (
                    <Check className="size-4 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
