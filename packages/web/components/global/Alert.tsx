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
    closeBg: "hover:bg-(--success-bg)",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-(--danger-bg)",
    border: "border-(--danger-border)",
    text: "text-(--danger-text)",
    closeBg: "hover:bg-(--danger-bg)",
    icon: AlertCircle,
  },
  warning: {
    bg: "bg-(--warning-bg)",
    border: "border-(--warning-border)",
    text: "text-(--warning-text)",
    closeBg: "hover:bg-(--warning-bg)",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-(--info-bg)",
    border: "border-(--info-border)",
    text: "text-(--info-text)",
    closeBg: "hover:bg-(--info-bg)",
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
      <span className={cn("text-xs flex-1 min-w-0 break-words", config.text)}>
        {message}
      </span>
      <motion.button
        type="button"
        onClick={onClose}
        className={cn(
          "shrink-0 cursor-pointer rounded-sm p-1 transition-colors",
          config.text,
          config.closeBg,
        )}
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        style={{ willChange: "transform" }}
      >
        <X className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
};
