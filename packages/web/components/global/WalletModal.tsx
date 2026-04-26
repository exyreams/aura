"use client";

import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, ExternalLink, Wallet, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { wallets, select, connect, connecting, connected } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (connected) {
      onClose();
    }
  }, [connected, onClose]);

  if (!mounted || !isOpen) return null;

  const handleWalletClick = async (walletName: WalletName) => {
    try {
      select(walletName);
      await connect();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const installedWallets = wallets.filter(
    (wallet) => wallet.readyState === "Installed",
  );
  const notInstalledWallets = wallets.filter(
    (wallet) => wallet.readyState !== "Installed",
  );

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-(--card-bg) border border-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-(--text-main)">
              Connect Wallet
            </h2>
            <p className="text-sm text-(--text-muted) mt-1">
              Choose your Solana wallet
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-(--text-muted) hover:text-(--text-main) transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Installed Wallets */}
          {installedWallets.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="text-xs font-mono uppercase tracking-widest text-(--text-muted)">
                Installed
              </h3>
              {installedWallets.map((wallet) => (
                <button
                  type="button"
                  key={wallet.adapter.name}
                  onClick={() => handleWalletClick(wallet.adapter.name)}
                  disabled={connecting}
                  className="w-full flex items-center gap-4 p-4 bg-(--card-content) hover:bg-(--hover-bg) border border-border rounded-lg transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Image
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    width={40}
                    height={40}
                    unoptimized
                    className="w-10 h-10 rounded-lg"
                  />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-(--text-main) group-hover:text-primary transition-colors">
                      {wallet.adapter.name}
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      {connecting ? "Connecting..." : "Ready to connect"}
                    </p>
                  </div>
                  <Wallet className="w-5 h-5 text-(--text-muted) group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* Not Installed Wallets */}
          {notInstalledWallets.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-(--text-muted)">
                Available Wallets
              </h3>
              {notInstalledWallets.map((wallet) => (
                <a
                  key={wallet.adapter.name}
                  href={wallet.adapter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-4 p-4 bg-(--card-content) hover:bg-(--hover-bg) border border-border rounded-lg transition-all group"
                >
                  <Image
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    width={40}
                    height={40}
                    unoptimized
                    className="w-10 h-10 rounded-lg opacity-60 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="flex-1 text-left">
                    <p className="font-medium text-(--text-main) group-hover:text-primary transition-colors">
                      {wallet.adapter.name}
                    </p>
                    <p className="text-xs text-(--text-muted)">Not installed</p>
                  </div>
                  <ExternalLink className="w-5 h-5 text-(--text-muted) group-hover:text-primary transition-colors" />
                </a>
              ))}
            </div>
          )}

          {/* No Wallets */}
          {wallets.length === 0 && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-(--text-muted) mx-auto mb-4" />
              <p className="text-(--text-main) font-medium mb-2">
                No wallets detected
              </p>
              <p className="text-sm text-(--text-muted) mb-4">
                Install a Solana wallet to continue
              </p>
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="primary" size="small">
                  Get Phantom Wallet
                </Button>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-(--card-content)">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-(--text-muted) mt-0.5 shrink-0" />
            <p className="text-xs text-(--text-muted) leading-relaxed">
              By connecting your wallet, you agree to our Terms of Service and
              acknowledge that you have read our Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
