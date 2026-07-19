"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type React from "react";
import { useId, useState } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export interface AccordionItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: string;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  items,
  defaultOpen,
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const accordionId = useId().replace(/:/g, "");
  const [openItem, setOpenItem] = useState<string | null>(defaultOpen || null);

  const toggleItem = (id: string) => {
    setOpenItem((current) => (current === id ? null : id));
  };

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => {
        const isOpen = openItem === item.id;
        const triggerId = `${accordionId}-accordion-trigger-${item.id}`;
        const contentId = `${accordionId}-accordion-content-${item.id}`;
        const hasDescription = Boolean(item.description);

        return (
          <div
            key={item.id}
            className="overflow-hidden rounded-sm border border-border bg-(--accordion-bg)"
          >
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              id={triggerId}
              aria-expanded={isOpen}
              aria-controls={contentId}
              className={cn(
                "flex w-full items-center justify-between gap-4 bg-(--accordion-bg) px-5 py-4 text-left transition-colors duration-150 ease-out hover:bg-(--accordion-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--accordion-bg) motion-reduce:transition-none",
                hasDescription && "items-start",
              )}
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-(--text-main)">
                  {item.title}
                </span>
                {item.description ? (
                  <span className="mt-1 block text-xs leading-5 text-(--text-muted)">
                    {item.description}
                  </span>
                ) : null}
              </div>
              <m.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.16,
                  ease: EASE_OUT,
                }}
                className="shrink-0"
              >
                <ChevronDown size={16} className="size-4 text-(--text-muted)" />
              </m.div>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  id={contentId}
                  role="region"
                  aria-labelledby={triggerId}
                  initial={
                    reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : { height: "auto", opacity: 1 }
                  }
                  exit={
                    reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : 0.18,
                    ease: EASE_OUT,
                  }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border bg-(--accordion-content) p-5 text-xs leading-relaxed text-(--text-muted)">
                    {item.content}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
