"use client";

import { X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
  closeLabel?: string;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  children,
  ariaLabelledBy,
  ariaDescribedBy,
  closeLabel = "Close modal",
  className,
}: ModalProps) {
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const previousOverflowRef = useRef<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((value) => value + 1);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflowRef.current ?? "";
      lastFocusedRef.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.offsetParent !== null,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (active === panelRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!mountedRef.current) {
    return null;
  }

  const backdropVariants = {
    hidden: {
      opacity: 0,
      transition: { duration: reduceMotion ? 0 : 0.08, ease: EASE_OUT },
    },
    visible: {
      opacity: 1,
      transition: { duration: reduceMotion ? 0 : 0.12, ease: EASE_OUT },
    },
  };

  const panelVariants = {
    hidden: {
      opacity: 0,
      transform: reduceMotion
        ? "translate3d(0, 0, 0) scale(1)"
        : "translate3d(0, 6px, 0) scale(0.98)",
      transition: { duration: reduceMotion ? 0 : 0.09, ease: EASE_OUT },
    },
    visible: {
      opacity: 1,
      transform: "translate3d(0, 0, 0) scale(1)",
      transition: { duration: reduceMotion ? 0 : 0.16, ease: EASE_OUT },
    },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-3 sm:items-center">
          <m.button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-black/50"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            onClick={onClose}
          />

          <m.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            className={cn(
              "relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-xl outline-none will-change-transform sm:max-w-lg sm:p-5",
              className,
            )}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={panelVariants}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none"
              aria-label={closeLabel}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            {children}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
