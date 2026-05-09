"use client";

import { KeyRound, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { SignInDialog } from "@/components/global/SignInDialog";
import { Skeleton } from "@/components/global/Skeleton";
import { WalletModal } from "@/components/global/WalletModal";
import { useAuth } from "@/lib/hooks";

// Page-level skeleton shown while auth state is resolving on reload

function AuthLoadingSkeleton() {
  return (
    <div className="relative max-w-[1600px] mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-sm" />
          <Skeleton className="h-9 w-28 rounded-sm" />
        </div>
      </div>
      {/* Stats card */}
      <Skeleton className="h-16 w-full mb-8 rounded-sm" />
      {/* Callout */}
      <Skeleton className="h-10 w-full mb-8 rounded-sm" />
      {/* List header */}
      <Skeleton className="h-3 w-20 mb-3" />
      {/* Agent rows */}
      <div className="space-y-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  if (pathname === "/dashboard/settings") {
    return <>{children}</>;
  }

  // While the session check is in-flight on reload, show a page skeleton
  // instead of flashing the auth gate or the real content.
  if (auth.isLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (auth.isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <SignInDialog />
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
      <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-2xl items-center justify-center">
        <Card hover={false} className="w-full space-y-6">
          {auth.walletAddress ? (
            <>
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
                  <KeyRound className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-(--text-muted)">
                    Sign In Required
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold text-(--text-main)">
                    Verify this wallet session
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-(--text-muted)">
                    Dashboard actions use the backend agent vault and require a
                    SIWS cookie session before any agent keys are listed or
                    used.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="primary"
                icon={<KeyRound className="size-4" />}
                loading={auth.isSigningIn}
                onClick={() => void auth.login()}
                className="w-full sm:w-auto"
              >
                Sign In
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-(--hover-bg)">
                  <Wallet className="size-5 text-(--text-main)" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-(--text-muted)">
                    Wallet Required
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold text-(--text-main)">
                    Connect a wallet to continue
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-(--text-muted)">
                    Your wallet owns the cookie session and the agent keypairs
                    linked to treasury operations.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="primary"
                icon={<Wallet className="size-4" />}
                onClick={() => setWalletModalOpen(true)}
                className="w-full sm:w-auto"
              >
                Connect Wallet
              </Button>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
