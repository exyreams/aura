"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/global/Button";
import { useAuth } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

export function SignInDialog() {
  const wallet = useWallet();
  const auth = useAuth();
  const walletAddress = wallet.publicKey?.toBase58() ?? "";
  const [dismissed, setDismissed] = useState(false);
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) setDismissed(false);
  }, [auth.isAuthenticated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: walletAddress is an intentional trigger — reset dismissed state on wallet change
  useEffect(() => {
    setDismissed(false);
  }, [walletAddress]);

  const isOpen = auth.needsSignIn && !dismissed && !auth.isAuthenticated;

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setDismissed(true);
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
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
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
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-(--border) bg-(--hover-bg)">
                  <ShieldCheck className="size-4 text-(--primary)" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-(--text-muted)">
                    Wallet Verification
                  </p>
                  <h3 className="text-lg font-semibold text-(--text-main) tracking-tight leading-tight">
                    Sign in to AURA
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-(--text-muted) hover:text-(--text-main) transition-colors hover:bg-(--hover-bg) rounded-sm p-1 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Description */}
            <p className="px-6 pb-5 text-sm leading-relaxed text-(--text-muted)">
              Sign a message to verify wallet ownership. The backend will set a
              secure session cookie, no bearer token is stored in the browser.
            </p>

            {/* Wallet row */}
            {walletAddress && (
              <div className="mx-6 mb-5 bg-(--card-bg) border border-border rounded-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-xs text-(--text-muted)">
                    Connected Wallet
                  </span>
                  <span className="font-mono text-xs text-(--text-main)">
                    {shortenAddress(walletAddress, 8, 8)}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {auth.error && (
              <div className="mx-6 mb-5 rounded-sm border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger font-mono">
                {auth.error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6">
              <Button
                type="button"
                variant="secondary"
                disabled={auth.isSigningIn}
                onClick={() => void wallet.disconnect()}
                className="flex-1"
              >
                Disconnect
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={<KeyRound className="size-4" />}
                loading={auth.isSigningIn}
                disabled={!wallet.publicKey || auth.isSigningIn}
                onClick={() => void auth.login()}
                className="flex-1"
              >
                Sign In
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
