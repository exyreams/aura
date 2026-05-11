"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/global/Badge";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface TimelineRowProps {
  /** Left-side icon (replaces the dot when provided) */
  icon?: React.ReactNode;
  /** Bold mono label */
  label: string;
  /** Badge next to the label */
  badge?: { label: string; variant: BadgeVariant };
  /** Secondary badges (violations etc.) */
  extraBadges?: { label: string; variant: BadgeVariant }[];
  /** Sub-line below the label row */
  meta?: React.ReactNode;
  /** Expandable detail content */
  detail?: React.ReactNode;
  isLast?: boolean;
  className?: string;
}

export function TimelineRow({
  icon,
  label,
  badge,
  extraBadges,
  meta,
  detail,
  isLast = false,
  className,
}: TimelineRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!detail;

  return (
    <div className={cn("flex gap-3 sm:gap-4", className)}>
      {/* Icon / dot + spine */}
      <div className="flex flex-col items-center shrink-0 w-7 sm:w-8">
        <div className="mt-1 size-6 sm:size-7 flex items-center justify-center z-10 shrink-0">
          {icon ?? (
            <div className="size-[7px] rounded-full bg-primary mt-[5px]" />
          )}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-[24px]" />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0", isLast ? "pb-0" : "pb-5 sm:pb-6")}>
        {/* Header row */}
        <button
          type="button"
          disabled={!hasDetail}
          className={cn(
            "w-full flex items-start justify-between gap-2 mb-1 rounded-sm px-2 py-1 -mx-2 transition-colors text-left",
            hasDetail
              ? "cursor-pointer hover:bg-(--accordion-hover)"
              : "cursor-default",
          )}
          onClick={() => hasDetail && setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold text-(--text-main) uppercase tracking-wide">
              {label}
            </span>
            {badge && (
              <Badge
                variant={badge.variant}
                className="text-[9px] px-1.5 py-0.5"
              >
                {badge.label}
              </Badge>
            )}
            {extraBadges?.map((b) => (
              <Badge
                key={b.label}
                variant={b.variant}
                className="text-[9px] px-1.5 py-0.5"
              >
                {b.label}
              </Badge>
            ))}
          </div>
          {hasDetail && (
            <m.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="shrink-0 mt-0.5"
            >
              <ChevronDown size={12} className="text-(--text-muted)" />
            </m.div>
          )}
        </button>

        {/* Meta row */}
        {meta && (
          <div className="font-mono text-[10px] text-(--text-muted) mb-1.5">
            {meta}
          </div>
        )}

        {/* Expandable detail */}
        {hasDetail && (
          <AnimatePresence initial={false}>
            {expanded && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div
                  className="mt-1 border border-border rounded-sm overflow-hidden"
                  style={{ background: "var(--accordion-bg)" }}
                >
                  {detail}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
