"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LogOut, Wallet } from "lucide-react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { formatAddress } from "@/lib/formatting/addresses";

export function AuthButton() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const auth = useOwnerAuth();
  const address = wallet.publicKey?.toBase58();

  if (!wallet.connected || !address) {
    return (
      <Button type="button" variant="primary" onClick={() => setVisible(true)}>
        <Wallet className="size-4" aria-hidden="true" />
        Connect wallet
      </Button>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Button
        type="button"
        variant="primary"
        onClick={() => void auth.signIn()}
        disabled={auth.isSigningIn}
      >
        <Wallet className="size-4" aria-hidden="true" />
        {auth.isSigningIn ? "Signing in" : "Sign in"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-muted md:inline-flex">
        {formatAddress(address)}
      </span>
      <Button
        type="button"
        variant="secondary"
        onClick={() => void auth.signOut()}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
