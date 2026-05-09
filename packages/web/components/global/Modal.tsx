"use client";

import { X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
}) => {
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!mountedRef.current) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-9999 flex items-center justify-center p-4"
          style={{
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={handleBackdropClick}
        >
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "bg-(--bg) border border-border rounded-sm shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100vh-4rem)]",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="flex justify-between items-center p-6 border-b border-border shrink-0">
                <h3 className="text-lg font-semibold text-(--text-main) tracking-tight">
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-(--text-muted) hover:text-(--text-main) transition-colors hover:bg-(--hover-bg) rounded-sm p-1.5"
                >
                  <X className="size-5" />
                </button>
              </div>
            )}

            <div className="p-6 overflow-y-auto flex-1 slim-scrollbar">
              {children}
            </div>

            {footer && (
              <div className="p-6 border-t border-border flex gap-3 shrink-0">
                {footer}
              </div>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};
