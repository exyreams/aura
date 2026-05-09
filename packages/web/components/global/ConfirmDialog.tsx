"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export interface ConfirmDialogRow {
  label: string;
  value: React.ReactNode;
  /** Renders a divider above this row — use for totals */
  dividerAbove?: boolean;
  bold?: boolean;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  rows?: ConfirmDialogRow[];
  disclaimer?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  loading?: boolean;
}

const EMPTY_ROWS: ConfirmDialogRow[] = [];

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  rows = EMPTY_ROWS,
  disclaimer,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  loading = false,
}) => {
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!mountedRef.current) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-9999 flex items-center justify-center p-4"
          style={{
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onClick={handleBackdrop}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-(--bg) border border-border rounded-sm shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-5">
              <h3 className="text-xl font-semibold text-(--text-main) tracking-tight">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-(--text-muted) hover:text-(--text-main) transition-colors hover:bg-(--hover-bg) rounded-sm p-1 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Detail rows */}
            {rows.length > 0 && (
              <div className="mx-6 mb-5 bg-(--card-bg) border border-border rounded-sm overflow-hidden">
                {rows.map((row) => (
                  <div key={row.label}>
                    {row.dividerAbove && <div className="h-px bg-border" />}
                    <div className="flex items-center justify-between px-5 py-3.5">
                      <span
                        className={`text-xs ${row.bold ? "font-bold text-(--text-main)" : "text-(--text-muted)"}`}
                      >
                        {row.label}
                      </span>
                      <span
                        className={`font-mono text-xs ${row.bold ? "font-bold text-(--text-main)" : "text-(--text-muted)"}`}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            {disclaimer && (
              <p className="mx-6 mb-6 text-xs text-(--text-muted) italic leading-relaxed">
                {disclaimer}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={onClose}
                disabled={loading}
              >
                {cancelLabel}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={onConfirm}
                loading={loading}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
