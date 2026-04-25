"use client";

import { motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked = false,
  onChange,
  label,
  disabled = false,
  className,
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onChange?.(!checked);
    }
  };

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {label && (
        <span
          className={cn(
            "text-sm font-medium",
            disabled ? "text-slate-500" : "text-(--text-main)",
          )}
        >
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "w-11 h-6 rounded-full relative transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          checked ? "bg-primary" : "bg-border",
        )}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
        />
      </button>
    </div>
  );
};
