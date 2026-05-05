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

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  if (pathname === "/dashboard/settings") {
    return <>{children}</>;
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
          {auth.isLoading ? (
            <>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-44" />
            </>
          ) : auth.walletAddress ? (
            <>
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-primary/10">
                  <KeyRound className="h-5 w-5 text-primary" />
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
                icon={<KeyRound className="h-4 w-4" />}
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-(--hover-bg)">
                  <Wallet className="h-5 w-5 text-(--text-main)" />
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
                icon={<Wallet className="h-4 w-4" />}
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
