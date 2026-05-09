"use client";

import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, ExternalLink, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/global/Button";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { wallets, select, connect, connecting, connected, wallet } =
    useWallet();
  const mountedRef = useRef(false);
  const pendingConnectRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [, forceUpdate] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectingName, setConnectingName] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
  }, []);

  // Keep onCloseRef in sync with the latest onClose prop
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Close when connected
  useEffect(() => {
    if (connected) {
      setConnectingName(null);
      pendingConnectRef.current = false;
      onClose();
    }
  }, [connected, onClose]);

  // Once wallet is selected and we have a pending connect, fire connect()
  useEffect(() => {
    if (!pendingConnectRef.current || !wallet) return;
    pendingConnectRef.current = false;
    connect().catch((error) => {
      setConnectingName(null);
      const msg = error instanceof Error ? error.message : "";
      if (
        !msg.toLowerCase().includes("user rejected") &&
        !msg.toLowerCase().includes("cancelled") &&
        !msg.toLowerCase().includes("wallet not selected")
      ) {
        setErrorMessage(msg || "Failed to connect wallet.");
      }
    });
  }, [wallet, connect]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setErrorMessage(null);
      setConnectingName(null);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!mountedRef.current) return null;

  const handleWalletClick = (walletName: WalletName) => {
    setErrorMessage(null);
    setConnectingName(walletName as string);
    select(walletName);
    pendingConnectRef.current = true;
  };

  const installedWallets = wallets.filter((w) => w.readyState === "Installed");
  const otherWallets = wallets.filter((w) => w.readyState !== "Installed");

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal — pops from center on all screen sizes */}
          <motion.div
            key="modal"
            className="relative w-full sm:max-w-sm bg-(--input-bg) border border-border rounded-xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* No drag handle — centered modal */}

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="font-semibold text-(--text-main) text-base">
                  Connect Wallet
                </h2>
                <p className="text-xs text-(--text-muted) mt-0.5">
                  Choose your Solana wallet
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="size-7 flex items-center justify-center rounded-full bg-(--hover-bg) text-(--text-muted) hover:text-(--text-main) transition-colors"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-border mx-5" />

            {/* Wallet list */}
            <div className="px-4 py-3 max-h-[55vh] overflow-y-auto">
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                >
                  <AlertCircle className="size-3.5 shrink-0" />
                  {errorMessage}
                </motion.div>
              )}

              {/* Installed */}
              {installedWallets.length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) px-1 mb-2">
                    Installed
                  </p>
                  <div className="space-y-1.5">
                    {installedWallets.map((wallet) => {
                      const isConnecting =
                        connectingName === wallet.adapter.name;
                      return (
                        <motion.button
                          type="button"
                          key={wallet.adapter.name}
                          onClick={() => handleWalletClick(wallet.adapter.name)}
                          disabled={connecting}
                          whileTap={{ scale: 0.99 }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-(--card-bg) hover:bg-(--hover-bg) border border-border hover:border-primary group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Image
                            src={wallet.adapter.icon}
                            alt={wallet.adapter.name}
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 rounded-lg shrink-0"
                          />
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium text-(--text-main) group-hover:text-primary">
                              {wallet.adapter.name}
                            </p>
                            <p className="text-[10px] text-(--text-muted)">
                              {isConnecting
                                ? "Opening wallet…"
                                : "Ready to connect"}
                            </p>
                          </div>
                          {isConnecting ? (
                            <motion.div
                              className="size-4 rounded-full border-2 border-primary border-t-transparent"
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 0.7,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover:opacity-100" />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other wallets */}
              {otherWallets.length > 0 && (
                <div className="mb-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) px-1 mb-2">
                    Get a wallet
                  </p>
                  <div className="space-y-1.5">
                    {otherWallets.map((wallet) => (
                      <motion.a
                        key={wallet.adapter.name}
                        href={wallet.adapter.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-(--card-bg) hover:bg-(--hover-bg) border border-border hover:border-primary group"
                      >
                        <Image
                          src={wallet.adapter.icon}
                          alt={wallet.adapter.name}
                          width={32}
                          height={32}
                          unoptimized
                          className="size-8 rounded-lg shrink-0 opacity-50 group-hover:opacity-100"
                        />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-(--text-main) group-hover:text-primary">
                            {wallet.adapter.name}
                          </p>
                          <p className="text-[10px] text-(--text-muted)">
                            Not installed
                          </p>
                        </div>
                        <ExternalLink className="size-3.5 text-(--text-muted) group-hover:text-primary" />
                      </motion.a>
                    ))}
                  </div>
                </div>
              )}

              {/* No wallets at all */}
              {wallets.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-(--text-main) font-medium mb-1">
                    No wallets detected
                  </p>
                  <p className="text-xs text-(--text-muted) mb-4">
                    Install a Solana wallet to continue
                  </p>
                  <a
                    href="https://phantom.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="primary" size="small">
                      Get Phantom
                    </Button>
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] text-(--text-muted) leading-relaxed text-center">
                By connecting you agree to our{" "}
                <span className="underline underline-offset-2 cursor-pointer hover:text-(--text-main) transition-colors">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="underline underline-offset-2 cursor-pointer hover:text-(--text-main) transition-colors">
                  Privacy Policy
                </span>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
