"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet } from "lucide-react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";

export function AuthButton() {
  const wallet = useWallet();
  const auth = useOwnerAuth();
  const hasConnectedWallet = wallet.connected && Boolean(wallet.publicKey);

  if (!hasConnectedWallet) {
    return <WalletAccountMenu connectLabel="Connect wallet" />;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-end gap-2">
        <WalletAccountMenu />
        <Button
          type="button"
          variant="primary"
          size="small"
          onClick={() => void auth.signIn()}
          disabled={auth.isLoading || auth.isSigningIn}
          loading={auth.isSigningIn}
          icon={<Wallet className="size-3" aria-hidden="true" />}
        >
          Sign in
        </Button>
      </div>
    );
  }

  return <WalletAccountMenu />;
}
