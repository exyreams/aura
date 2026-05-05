"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { useAuth } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

export function SignInDialog() {
  const wallet = useWallet();
  const auth = useAuth();
  const walletAddress = wallet.publicKey?.toBase58() ?? "";
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when wallet changes or auth succeeds
  useEffect(() => {
    if (auth.isAuthenticated) {
      setDismissed(false);
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    setDismissed(false);
  }, [walletAddress]);

  const isOpen = auth.needsSignIn && !dismissed && !auth.isAuthenticated;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setDismissed(true)}
      className="max-w-lg"
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-(--text-muted)">
              Wallet Verification
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-(--text-main)">
              Sign in to AURA
            </h2>
            <p className="mt-3 text-sm leading-6 text-(--text-muted)">
              Sign a message to verify wallet ownership. The backend will set a
              secure session cookie; no bearer token is stored in the browser.
            </p>
          </div>
        </div>

        {walletAddress ? (
          <div className="rounded-sm border border-border bg-(--card-bg) p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
              Connected Wallet
            </p>
            <p className="mt-2 break-all font-mono text-sm text-(--text-main)">
              {shortenAddress(walletAddress, 8, 8)}
            </p>
          </div>
        ) : null}

        {auth.error ? (
          <div className="rounded-sm border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            {auth.error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="primary"
            icon={<KeyRound className="h-4 w-4" />}
            loading={auth.isSigningIn}
            disabled={!wallet.publicKey || auth.isSigningIn}
            onClick={() => void auth.login()}
            className="w-full"
          >
            Sign In
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={auth.isSigningIn}
            onClick={() => void wallet.disconnect()}
            className="w-full"
          >
            Disconnect
          </Button>
        </div>
      </div>
    </Modal>
  );
}
