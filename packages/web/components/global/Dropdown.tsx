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
        className="bg-(--card-bg) border border-border rounded-sm px-3 py-2 font-mono text-[10px] uppercase tracking-widest outline-none w-full transition-colors text-(--text-main) flex items-center justify-between text-left hover:border-primary focus:border-primary"
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
          <ChevronDown className="size-3.5 text-(--text-muted)" />
        </m.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            style={{ transformOrigin: "top left" }}
            className="absolute top-full left-0 w-full mt-1.5 bg-(--card-bg) border border-border rounded-lg shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-1.5 space-y-0.5 max-h-60 overflow-y-auto slim-scrollbar">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 font-mono text-[10px] uppercase tracking-widest rounded-md flex items-center gap-2 transition-colors",
                    option.value === value
                      ? "bg-(--hover-bg) text-(--text-main) font-bold"
                      : "text-(--text-muted) hover:bg-(--hover-bg) hover:text-(--text-main)",
                  )}
                >
                  {option.icon && (
                    <span className="shrink-0">{option.icon}</span>
                  )}
                  <span className="flex-1">{option.label}</span>
                  {option.badge && (
                    <Badge variant="default" className="shrink-0 text-[9px]">
                      {option.badge}
                    </Badge>
                  )}
                  {option.value === value && (
                    <Check className="size-3 shrink-0 text-primary" />
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
