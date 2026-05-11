"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet } from "@/components/icons";
import { Alert } from "./Alert";
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
  /**
   * When provided, the confirm button requires the connected wallet to sign
   * this message before onConfirm is called. The message is shown in the dialog.
   */
  requireWalletSign?: string;
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
  requireWalletSign,
}) => {
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const wallet = useWallet();

  // Reset sign state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSigning(false);
      setSignError(null);
      setSigned(false);
    }
  }, [isOpen]);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !signing && !loading) onClose();
  };

  const handleConfirm = async () => {
    if (!requireWalletSign) {
      onConfirm();
      return;
    }

    if (!wallet.signMessage) {
      setSignError("Your wallet does not support message signing.");
      return;
    }
    if (!wallet.publicKey) {
      setSignError("Connect a wallet first.");
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      const message = new TextEncoder().encode(requireWalletSign);
      await wallet.signMessage(message);
      setSigned(true);
      // Small delay so user sees the "Signed ✓" state before proceeding
      await new Promise((r) => setTimeout(r, 400));
      onConfirm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // User rejected — don't show an error, just reset
      if (
        msg.toLowerCase().includes("reject") ||
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("user denied")
      ) {
        setSigning(false);
        return;
      }
      setSignError(msg);
      setSigning(false);
    }
  };

  if (!mountedRef.current) return null;

  const isBusy = signing || loading;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <m.div
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
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-(--bg) border border-border rounded-sm shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <h3 className="text-base font-semibold text-(--text-main) tracking-tight">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={isBusy}
                className="text-(--text-muted) hover:text-(--text-main) transition-colors hover:bg-(--hover-bg) rounded-sm p-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Detail rows */}
            {rows.length > 0 && (
              <div className="mx-5 mb-4 bg-(--card-bg) border border-border rounded-sm overflow-hidden divide-y divide-border">
                {rows.map((row) => (
                  <div key={row.label}>
                    {row.dividerAbove && <div className="h-px bg-border" />}
                    <div className="flex items-center justify-between px-4 py-2.5">
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
              <p className="mx-5 mb-4 text-xs text-(--text-muted) italic leading-relaxed">
                {disclaimer}
              </p>
            )}

            {/* Wallet sign requirement */}
            {requireWalletSign && (
              <div className="mx-5 mb-4 rounded-sm border border-border bg-(--card-bg) px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Wallet
                    className="size-3.5 text-(--text-muted)"
                    animateOnHover
                  />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                    Wallet signature required
                  </span>
                  {signed && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-success">
                      Signed ✓
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] text-(--text-muted) break-all leading-relaxed">
                  {requireWalletSign}
                </p>
              </div>
            )}

            {/* Sign error */}
            {signError && (
              <div className="mx-5 mb-4">
                <Alert
                  variant="error"
                  message={signError}
                  onClose={() => setSignError(null)}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 px-5 pb-5">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={onClose}
                disabled={isBusy}
              >
                {cancelLabel}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void handleConfirm()}
                loading={isBusy}
                icon={
                  requireWalletSign && !signed ? (
                    <Wallet className="size-4" animateOnHover />
                  ) : undefined
                }
              >
                {signing ? "Waiting for wallet…" : confirmLabel}
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
