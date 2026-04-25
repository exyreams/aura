"use client";

import { ChevronDown, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value = [],
  onChange,
  placeholder = "Search and select...",
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleToggle = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange?.(newValue);
    setSearchQuery("");
    inputRef.current?.focus();
    // Don't close dropdown - keep it open for multiple selections
  };

  const handleRemove = (optionValue: string) => {
    onChange?.(value.filter((v) => v !== optionValue));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && searchQuery.trim()) {
      e.preventDefault();
      const trimmedQuery = searchQuery.trim();

      // Check if it matches an existing option
      const matchingOption = availableOptions.find(
        (opt) => opt.label.toLowerCase() === trimmedQuery.toLowerCase(),
      );

      if (matchingOption) {
        // Add the matching option
        handleToggle(matchingOption.value);
      } else {
        // Add as custom value
        const customValue = trimmedQuery.toLowerCase().replace(/\s+/g, "-");
        if (!value.includes(customValue)) {
          onChange?.([...value, customValue]);
        }
        setSearchQuery("");
      }
    }
  };

  const selectedOptions = options.filter((opt) => value.includes(opt.value));
  const availableOptions = options.filter((opt) => !value.includes(opt.value));

  const filteredOptions = availableOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      {/* Combined Input + Tags */}
      <div className="bg-(--input-bg) border border-border rounded-sm px-4 py-2 min-h-[48px] flex items-center gap-2 focus-within:border-primary transition-colors">
        {/* Selected Tags Inline - Only wrap tags, not the whole container */}
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AnimatePresence>
              {selectedOptions.map((option) => (
                <motion.span
                  key={option.value}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="px-2 py-1 bg-(--card-content) border border-border text-(--text-main) mono text-[10px] rounded-sm flex items-center gap-1.5"
                >
                  {option.label}
                  <button
                    type="button"
                    onClick={() => handleRemove(option.value)}
                    className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Search Input - Always left-aligned */}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value.length > 0) {
              setIsOpen(true);
            }
          }}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedOptions.length === 0 ? placeholder : ""}
          className="flex-1 bg-transparent outline-none text-sm text-(--text-main) placeholder:text-(--text-muted) min-w-[120px] text-left"
        />

        {/* Chevron Icon */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              inputRef.current?.focus();
            }
          }}
          className="shrink-0"
        >
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <ChevronDown className="w-4 h-4 text-(--text-muted)" />
          </motion.div>
        </button>
      </div>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 w-full mt-2 bg-(--bg) border border-border rounded-sm shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleToggle(option.value)}
                    className="w-full text-left px-3 py-2 text-xs rounded-sm flex items-center gap-2 text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                  >
                    {option.icon && (
                      <span className="shrink-0 text-base">{option.icon}</span>
                    )}
                    <span className="flex-1">{option.label}</span>
                  </button>
                ))
              ) : availableOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-(--text-muted)">
                  All options selected
                </div>
              ) : searchQuery.length > 0 ? (
                <div className="px-3 py-2 text-xs text-(--text-muted)">
                  Press Enter or comma to add "{searchQuery}"
                </div>
              ) : (
                <div className="px-3 py-2 text-xs text-(--text-muted)">
                  No options available
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
