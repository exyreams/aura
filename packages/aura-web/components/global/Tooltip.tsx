"use client";

import { AnimatePresence, m } from "motion/react";
import type React from "react";
import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  position?: "top" | "right";
}

const TOOLTIP_MAX_WIDTH = 240;
const TOOLTIP_OFFSET = 8;

export function Tooltip({
  content,
  children,
  className,
  position = "top",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth =
      tooltipRef.current?.getBoundingClientRect().width ?? TOOLTIP_MAX_WIDTH;

    if (position === "right") {
      setStyle({
        left: `${rect.right + TOOLTIP_OFFSET}px`,
        top: `${rect.top + rect.height / 2}px`,
        transform: "translateY(-50%)",
      });
      return;
    }

    const halfWidth = tooltipWidth / 2;
    const x = Math.min(
      Math.max(rect.left + rect.width / 2, halfWidth + 8),
      window.innerWidth - halfWidth - 8,
    );

    setStyle({
      left: `${x}px`,
      top: `${rect.top - TOOLTIP_OFFSET}px`,
      transform: "translate(-50%, -100%)",
    });
  }, [visible, position]);

  const trigger = isValidElement<React.HTMLAttributes<HTMLElement>>(children)
    ? cloneElement(children, {
        onMouseEnter: (event) => {
          children.props.onMouseEnter?.(event);
          setVisible(true);
        },
        onMouseLeave: (event) => {
          children.props.onMouseLeave?.(event);
          setVisible(false);
        },
        onFocus: (event) => {
          children.props.onFocus?.(event);
          setVisible(true);
        },
        onBlur: (event) => {
          children.props.onBlur?.(event);
          setVisible(false);
        },
      })
    : children;

  return (
    <>
      <span ref={triggerRef} className={cn("inline-flex", className)}>
        {trigger}
      </span>
      {typeof window !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {visible ? (
                <div
                  ref={tooltipRef}
                  className="pointer-events-none fixed z-[10000]"
                  style={style}
                >
                  <m.div
                    initial={{ opacity: 0, scale: 0.96, y: 2 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 2 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                    className="max-w-[240px] rounded-md border border-border bg-surface/95 px-2.5 py-1.5 font-mono text-[10px] text-foreground shadow-md backdrop-blur-md"
                    role="tooltip"
                  >
                    {content}
                  </m.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
