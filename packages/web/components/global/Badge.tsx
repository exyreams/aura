import type React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "active"
  | "paused"
  | "error"
  | "default"
  | "low"
  | "medium"
  | "high";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses = {
  active: "bg-(--success-bg) border-(--success-border) text-(--success-text)",
  paused: "bg-(--warning-bg) border-(--warning-border) text-(--warning-text)",
  error: "bg-(--danger-bg) border-(--danger-border) text-(--danger-text)",
  default: "bg-(--card-bg) border-(--border) text-(--text-muted)",
  low: "bg-(--success-bg) border-(--success-border) text-(--success-text)",
  medium: "bg-(--warning-bg) border-(--warning-border) text-(--warning-text)",
  high: "bg-(--danger-bg) border-(--danger-border) text-(--danger-text)",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  children,
  className,
}) => {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-4 py-1.5 rounded-sm border text-[10px] font-bold mono uppercase",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
};

export const StatusPill: React.FC<BadgeProps> = ({
  variant = "default",
  children,
  className,
}) => {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-3 py-0.5 rounded-full text-[10px] font-semibold mono uppercase border",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
};
