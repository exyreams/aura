"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { LinkIcon, Mail, Wallet } from "lucide-react";
import Link from "next/link";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useOwnerAuth();
  const wallet = useWallet();
  const hasConnectedWallet = wallet.connected && Boolean(wallet.publicKey);

  if (auth.isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-7xl gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-7xl items-center justify-center py-16">
        <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-6">
          <div className="mb-5 flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Mail className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to AURA
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use your email account to keep sessions persistent, then link a
            wallet to authorize owner operations.
          </p>
          {auth.error ? (
            <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {auth.error}
            </p>
          ) : null}
          <div className="mt-6">
            <Link href="/auth/login">
              <Button
                type="button"
                variant="primary"
                icon={<Mail className="size-3" aria-hidden="true" />}
              >
                Sign in with email
              </Button>
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (auth.needsWalletLink) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-7xl items-center justify-center py-16">
        <section className="w-full max-w-xl rounded-lg border border-border bg-surface p-6">
          <div className="mb-5 flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Wallet
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Link an owner wallet
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connect a Solana wallet and sign the AURA link message. The wallet
            will be linked to {auth.user?.email ?? "this email account"}.
          </p>
          {auth.error ? (
            <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {auth.error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <WalletAccountMenu
              connectLabel="Connect wallet"
              showAppNavigation={false}
            />
            <Button
              type="button"
              variant="primary"
              onClick={() => void auth.linkConnectedWallet()}
              disabled={!hasConnectedWallet || auth.isLinkingWallet}
              loading={auth.isLinkingWallet}
              icon={<LinkIcon className="size-3" aria-hidden="true" />}
            >
              Link wallet
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return children;
}
