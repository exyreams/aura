"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import type React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "disabled";
export type ButtonSize = "small" | "medium";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = ({
  variant = "primary",
  size = "medium",
  icon,
  iconPosition = "left",
  loading = false,
  children,
  className,
  disabled,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  const baseClasses =
    "inline-flex min-h-10 items-center justify-center font-mono font-bold uppercase tracking-wider transition-colors rounded-sm gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)";

  const variantClasses = {
    // Solid filled — primary action
    primary: "bg-(--primary) text-(--bg) hover:opacity-80",
    // Outlined — secondary action
    secondary:
      "bg-(--card-bg) border border-border text-(--text-main) hover:border-primary hover:bg-(--hover-bg)",
    // Destructive — solid red
    danger: "bg-[var(--danger)] text-white hover:opacity-80",
    // Subtle — no border, no bg, text only
    ghost:
      "bg-transparent text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
    // Explicit disabled variant — flat, muted, non-interactive
    disabled:
      "bg-(--hover-bg) text-(--text-muted) cursor-not-allowed opacity-50",
  };

  const sizeClasses = {
    small: "px-4 py-2 text-[10px]",
    medium: "px-6 py-3 text-xs",
  };

  const spinnerSizes = {
    small: "xs" as const,
    medium: "xs" as const,
  };

  const isDisabledVariant = variant === "disabled";
  const isDisabled = disabled || loading || isDisabledVariant;

  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        // prop-based disabled (not variant) — dim + block cursor
        disabled &&
          !isDisabledVariant &&
          !loading &&
          "opacity-70 cursor-not-allowed",
        loading && "cursor-not-allowed",
        className,
      )}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      style={{ willChange: "transform" }}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size={spinnerSizes[size]} />
          <span>{children}</span>
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && <span>{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span>{icon}</span>}
        </>
      )}
    </motion.button>
  );
};

Button.displayName = "Button";
