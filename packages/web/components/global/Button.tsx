"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "medium",
      icon,
      loading = false,
      children,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      "inline-flex items-center justify-center font-mono font-bold uppercase tracking-wider transition-colors rounded-sm gap-2";

    const variantClasses = {
      primary: "bg-(--primary) text-(--bg) hover:opacity-90",
      secondary:
        "bg-(--card-bg) border border-border text-(--text-main) hover:border-primary hover:bg-(--hover-bg)",
      danger: "bg-danger text-white hover:opacity-90",
      ghost:
        "bg-(--card-bg) text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
    };

    const sizeClasses = {
      small: "px-4 py-2 text-[10px]",
      medium: "px-6 py-3 text-xs",
      large: "px-8 py-4 text-sm",
    };

    const spinnerSizes = {
      small: "small" as const,
      medium: "small" as const,
      large: "medium" as const,
    };

    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          isDisabled && "opacity-30 cursor-not-allowed",
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
            <span className="opacity-70">{children}</span>
          </>
        ) : (
          <>
            {icon && <span>{icon}</span>}
            {children}
          </>
        )}
      </motion.button>
    );
  },
);

Button.displayName = "Button";
