"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "success" | "error" | "warning" | "info";

export interface AlertProps {
  variant: AlertVariant;
  message: string;
  onClose?: () => void;
  className?: string;
}

const variantConfig = {
  success: {
    bg: "bg-(--success-bg)",
    border: "border-(--success-border)",
    text: "text-(--success-text)",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-(--danger-bg)",
    border: "border-(--danger-border)",
    text: "text-(--danger-text)",
    icon: AlertCircle,
  },
  warning: {
    bg: "bg-(--warning-bg)",
    border: "border-(--warning-border)",
    text: "text-(--warning-text)",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-(--info-bg)",
    border: "border-(--info-border)",
    text: "text-(--info-text)",
    icon: Info,
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant,
  message,
  onClose,
  className,
}) => {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "p-4 rounded-sm flex items-center gap-4 border",
        config.bg,
        config.border,
        className,
      )}
    >
      <IconComponent className={cn("w-5 h-5 shrink-0", config.text)} />
      <span className={cn("text-xs flex-1", config.text)}>{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) rounded-sm p-1 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
};
