import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, containerClassName, id, ...props }, ref) => {
    const textareaId =
      id || `textarea-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className={cn("space-y-2", containerClassName)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main) resize-y",
            "focus:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            error && "border-red-500/50 bg-red-500/5 focus:border-red-500",
            className,
          )}
          {...props}
        />
        {error && (
          <span className="text-[10px] text-red-500 mono">{error}</span>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
