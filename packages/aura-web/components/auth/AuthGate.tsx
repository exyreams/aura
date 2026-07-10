"use client";

import { Wallet } from "lucide-react";
import { AuthButton } from "@/components/auth/AuthButton";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Skeleton } from "@/components/global/Skeleton";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useOwnerAuth();

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
            <Wallet
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to AURA
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connect the owner wallet to view registered agent wallets, device
            approvals, proposals, and activity.
          </p>
          {auth.error ? (
            <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {auth.error}
            </p>
          ) : null}
          <div className="mt-6">
            <AuthButton />
          </div>
        </section>
      </div>
    );
  }

  return children;
}
