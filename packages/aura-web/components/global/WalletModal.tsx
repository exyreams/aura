"use client";

import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, ExternalLink, Wallet, X } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/global/Button";
import { formatAddress } from "@/lib/formatting/addresses";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { wallets, select, connect, connecting, wallet, publicKey } =
    useWallet();
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(false);
  const pendingConnectRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const walletAddressRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAfterConnectRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [, forceUpdate] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const walletAddress = publicKey?.toBase58() ?? null;

  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
    return () => {
      mountedRef.current = false;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      if (closeAfterConnectRef.current) {
        clearTimeout(closeAfterConnectRef.current);
      }
    };
  }, []);

  // Keep onCloseRef in sync with the latest onClose prop
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

  const connectSelectedWallet = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
    if (closeAfterConnectRef.current) {
      clearTimeout(closeAfterConnectRef.current);
    }
    setErrorMessage(null);
    connect()
      .then(() => {
        pendingConnectRef.current = false;
        connectTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current || walletAddressRef.current) {
            return;
          }
          setConnectingName(null);
          setErrorMessage(
            "Wallet did not return an address. Unlock it and try again.",
          );
        }, 700);
      })
      .catch((error) => {
        setConnectingName(null);
        pendingConnectRef.current = false;
        const msg = error instanceof Error ? error.message : "";
        const normalized = msg.toLowerCase();
        setErrorMessage(
          normalized.includes("user rejected") ||
            normalized.includes("cancelled")
            ? "Connection request was cancelled."
            : msg || "Failed to connect wallet.",
        );
      });
  }, [connect]);

  useEffect(() => {
    if (!isOpen || !walletAddress) {
      return;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
    setConnectingName(null);
    setErrorMessage(null);
    pendingConnectRef.current = false;
    closeAfterConnectRef.current = setTimeout(() => {
      onCloseRef.current();
    }, 600);
  }, [isOpen, walletAddress]);

  // Once wallet is selected and we have a pending connect, fire connect().
  useEffect(() => {
    if (!pendingConnectRef.current || !wallet) return;
    pendingConnectRef.current = false;
    connectSelectedWallet();
  }, [wallet, connectSelectedWallet]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      pendingConnectRef.current = false;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      pendingConnectRef.current = false;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      if (closeAfterConnectRef.current) {
        clearTimeout(closeAfterConnectRef.current);
      }
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
    if (wallet?.adapter.name === walletName) {
      pendingConnectRef.current = false;
      connectSelectedWallet();
      return;
    }
    pendingConnectRef.current = true;
    select(walletName);
  };

  const installedWallets = wallets.filter((w) => w.readyState === "Installed");
  const otherWallets = wallets.filter((w) => w.readyState !== "Installed");
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
  const modalVariants = {
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

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-3 sm:items-center">
          <m.div
            key="backdrop"
            className="absolute inset-0 bg-black/50"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            onClick={onClose}
          />

          <m.div
            key="modal"
            className="relative max-h-[calc(100dvh-1.5rem)] w-full overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-xl will-change-transform sm:max-w-sm"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={modalVariants}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            aria-describedby="wallet-modal-description"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Close wallet modal"
            >
              <X className="size-4" />
            </button>

            <div className="grid gap-4">
              <div className="grid gap-3 pr-12">
                <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                  <Wallet className="size-5" aria-hidden="true" />
                </div>
                <div className="grid gap-1">
                  <h2
                    id="wallet-modal-title"
                    className="text-base font-semibold text-foreground"
                  >
                    Connect wallet
                  </h2>
                  <p
                    id="wallet-modal-description"
                    className="text-sm leading-6 text-muted-foreground"
                  >
                    Choose an owner wallet to continue into AURA.
                  </p>
                </div>
              </div>

              <div className="max-h-[55dvh] overflow-y-auto pr-1">
                {walletAddress ? (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    <Wallet className="size-4 shrink-0" aria-hidden="true" />
                    Connected {formatAddress(walletAddress)}
                  </div>
                ) : errorMessage ? (
                  <m.div
                    initial={{
                      opacity: 0,
                      transform: reduceMotion
                        ? "translate3d(0, 0, 0)"
                        : "translate3d(0, -4px, 0)",
                    }}
                    animate={{
                      opacity: 1,
                      transform: "translate3d(0, 0, 0)",
                    }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.12,
                      ease: EASE_OUT,
                    }}
                    className="mb-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    <AlertCircle className="size-4 shrink-0" />
                    {errorMessage}
                  </m.div>
                ) : null}

                {installedWallets.length > 0 ? (
                  <div className="grid gap-2">
                    {installedWallets.map((wallet) => {
                      const isConnecting =
                        connectingName === wallet.adapter.name;
                      return (
                        <button
                          type="button"
                          key={wallet.adapter.name}
                          onClick={() => handleWalletClick(wallet.adapter.name)}
                          disabled={connecting}
                          className="group flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors duration-100 ease-out hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
                        >
                          <Image
                            src={wallet.adapter.icon}
                            alt={wallet.adapter.name}
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 shrink-0 rounded-md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {wallet.adapter.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isConnecting ? "Opening wallet" : "Installed"}
                            </p>
                          </div>
                          {isConnecting ? (
                            <div
                              className="size-4 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <span
                              className="size-2 rounded-full bg-primary opacity-60 transition-opacity duration-100 group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {otherWallets.length > 0 ? (
                  <div className={installedWallets.length > 0 ? "mt-4" : ""}>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Install a wallet
                    </p>
                    <div className="grid gap-2">
                      {otherWallets.map((wallet) => (
                        <a
                          key={wallet.adapter.name}
                          href={wallet.adapter.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors duration-100 ease-out hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none"
                        >
                          <Image
                            src={wallet.adapter.icon}
                            alt={wallet.adapter.name}
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 shrink-0 rounded-md opacity-55 transition-opacity duration-100 group-hover:opacity-100"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {wallet.adapter.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Not installed
                            </p>
                          </div>
                          <ExternalLink className="size-4 text-muted-foreground transition-colors duration-100 group-hover:text-primary" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {wallets.length === 0 ? (
                  <div className="grid gap-4 rounded-md border border-dashed border-border bg-background px-4 py-6 text-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        No wallets detected
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Install a Solana wallet to continue.
                      </p>
                    </div>
                    <a
                      href="https://phantom.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="justify-self-center"
                    >
                      <Button variant="primary" size="small">
                        Get Phantom
                      </Button>
                    </a>
                  </div>
                ) : null}
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                By connecting, you agree to AURA{" "}
                <span className="font-medium text-foreground">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="font-medium text-foreground">
                  Privacy Policy
                </span>
                . Transaction signing stays explicit.
              </p>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
