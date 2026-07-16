"use client";

import { LogOut, Mail, Settings, UserCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";
import { cn, shortenAddress } from "@/lib/utils";

export function AuthButton() {
  const auth = useOwnerAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const label =
    auth.user?.email ??
    auth.primaryWallet?.wallet_address ??
    auth.profile?.id ??
    "Account";
  const shortLabel = label.includes("@") ? label : shortenAddress(label, 4, 4);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (auth.isLoading) {
    return (
      <Button type="button" variant="disabled" size="small">
        Account
      </Button>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Link href="/auth/login">
        <Button
          type="button"
          variant="primary"
          size="small"
          icon={<Mail className="size-3" aria-hidden="true" />}
        >
          Login
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <WalletAccountMenu
        connectLabel={auth.primaryWallet ? "Connect wallet" : "Link wallet"}
      />
      <div ref={menuRef} className="relative">
        <Button
          type="button"
          variant="secondary"
          size="small"
          onClick={() => setMenuOpen((open) => !open)}
          icon={<UserCircle className="size-3.5" aria-hidden="true" />}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {shortLabel}
        </Button>

        {menuOpen ? (
          <div
            className={cn(
              "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-(--card-bg) shadow-2xl",
            )}
            role="menu"
          >
            <div className="border-b border-border px-3 py-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-(--text-muted)">
                Signed in
              </p>
              <p className="mt-1 truncate text-xs text-(--text-main)">
                {auth.user?.email ?? "Email account"}
              </p>
            </div>
            <div className="p-1.5">
              <Link
                href="/dashboard/settings"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-xs text-(--text-main) transition-colors hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                role="menuitem"
              >
                <Settings className="size-3.5 text-(--text-muted)" />
                <span>Account settings</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void auth.signOut();
                }}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                role="menuitem"
              >
                <LogOut className="size-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
