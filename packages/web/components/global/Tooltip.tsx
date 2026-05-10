"use client";

import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOOLTIP_MAX_WIDTH = 240;
const TOOLTIP_OFFSET = 8;

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [flipped, setFlipped] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isVisible || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const _vh = window.innerHeight;

    // Horizontal: center on trigger, clamp to viewport with padding
    const idealX = rect.left + rect.width / 2;
    const halfW = TOOLTIP_MAX_WIDTH / 2;
    const clampedX = Math.min(Math.max(idealX, halfW + 8), vw - halfW - 8);

    // Vertical: prefer above, flip below if not enough space
    const spaceAbove = rect.top;
    const shouldFlip = spaceAbove < 60;
    setFlipped(shouldFlip);

    setStyle({
      left: `${clampedX}px`,
      top: shouldFlip
        ? `${rect.bottom + TOOLTIP_OFFSET}px`
        : `${rect.top - TOOLTIP_OFFSET}px`,
      transform: shouldFlip ? "translateX(-50%)" : "translate(-50%, -100%)",
    });
  }, [isVisible]);

  const tooltipVariants = {
    hidden: { opacity: 0, scale: 0.95, y: flipped ? -4 : 4 },
    visible: { opacity: 1, scale: 1, y: 0 },
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("relative inline-flex cursor-help", className)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        role="tooltip"
        aria-label={typeof content === "string" ? content : undefined}
      >
        {children}
      </span>
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <div className="fixed z-200 pointer-events-none" style={style}>
                <m.div
                  variants={tooltipVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="relative px-2.5 py-1.5 bg-(--card-bg)/90 text-(--text-muted) text-[10px] mono rounded border border-border shadow-lg backdrop-blur-md break-all"
                  style={{
                    maxWidth: `${TOOLTIP_MAX_WIDTH}px`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  {content}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="size-2 bg-(--card-bg) border-r border-b border-border rotate-45" />
                  </div>
                </m.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
};
