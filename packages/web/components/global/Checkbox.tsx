"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked = false,
  onChange,
  label,
  disabled = false,
  className,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange?.(e.target.checked);
    }
  };

  return (
    <label
      className={cn(
        "flex items-center gap-3 group",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            "peer appearance-none w-5 h-5 border border-border rounded-sm bg-(--card-bg) transition-all",
            !disabled &&
              "checked:bg-primary checked:border-primary cursor-pointer",
            disabled && "cursor-not-allowed",
          )}
        />
        <AnimatePresence>
          {checked && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute pointer-events-none"
            >
              <Check className="w-3 h-3 text-(--bg)" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {label && (
        <span
          className={cn(
            "text-xs text-(--text-muted) transition-colors",
            !disabled && "group-hover:text-(--text-main)",
          )}
        >
          {label}
        </span>
      )}
    </label>
  );
};
