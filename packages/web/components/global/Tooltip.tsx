"use client";

import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  }, [isVisible]);

  const tooltipVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 4 },
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
        aria-label={content}
      >
        {children}
      </span>
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <div
                className="fixed z-100 pointer-events-none"
                style={{
                  left: `${coords.x}px`,
                  top: `${coords.y}px`,
                  transform: "translate(-50%, calc(-100% - 8px))",
                }}
              >
                <motion.div
                  variants={tooltipVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="relative px-3 py-2 bg-(--card-bg) text-(--text-main) text-[10px] mono rounded border border-border shadow-xl backdrop-blur-sm whitespace-nowrap"
                >
                  {content}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="w-2 h-2 bg-(--card-bg) border-r border-b border-border rotate-45" />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
};
