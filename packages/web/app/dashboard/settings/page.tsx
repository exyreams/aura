"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  KeyRound,
  LinkIcon,
  Mail,
  Settings,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import {
  DashboardContent,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { StatusBadge } from "@/components/global/StatusBadge";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";
import { useAppSettings } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export default function SettingsPage() {
  const settings = useAppSettings();
  const auth = useOwnerAuth();
  const wallet = useWallet();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nextEmail, setNextEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasConnectedWallet = wallet.connected && Boolean(wallet.publicKey);
  const rows = [
    {
      label: "Network",
      value: settings.network,
      detail: "ConnectionProvider cluster selection.",
    },
    {
      label: "RPC endpoint",
      value: settings.endpoint,
      detail: settings.customRpcUrl ? "Custom RPC URL" : "Solana cluster URL",
    },
    {
      label: "AURA program",
      value: settings.programId,
      detail: settings.resolvedProgramId ? "Valid public key" : "Invalid value",
    },
    {
      label: "Currency",
      value: settings.currency,
      detail: "Display preference for future fiat views.",
    },
    {
      label: "Date format",
      value: settings.dateFormat,
      detail: "Display preference for dashboard timestamps.",
    },
  ];

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (nextPassword.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const result = await auth.changePassword(currentPassword, nextPassword);
      setStatus(result.message);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const handleEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    try {
      const result = await auth.requestEmailChange(nextEmail.trim());
      setStatus(result.message);
      setNextEmail("");
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  const runWalletAction = async (action: () => Promise<void>) => {
    setStatus(null);
    setError(null);

    try {
      await action();
      setStatus("Wallet links updated.");
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  return (
    <DashboardContent>
      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Account"
          title="Email identity and linked wallets"
          description="Your email session owns the account. Wallets are linked only after a signed Solana challenge verifies control of the address."
          action={
            <StatusBadge tone={auth.primaryWallet ? "success" : "warning"}>
              {auth.primaryWallet ? "Linked" : "Wallet required"}
            </StatusBadge>
          }
        />

        <div className="mt-5 grid gap-4">
          {status ? (
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {status}
            </p>
          ) : null}
          {error || auth.error ? (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error ?? auth.error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-md border border-border bg-background/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
                <Mail
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Email
                </p>
                <p className="mt-2 break-all text-sm">
                  {auth.user?.email ?? auth.profile?.email ?? "Unavailable"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Used for sign-in, recovery, and account management.
                </p>
              </div>
            </div>

            <form onSubmit={handleEmailChange} className="mt-5 grid gap-3">
              <Input
                label="New email"
                type="email"
                autoComplete="email"
                value={nextEmail}
                onChange={(event) => setNextEmail(event.target.value)}
                required
              />
              <Button
                type="submit"
                variant="secondary"
                loading={auth.isSubmitting}
                disabled={auth.isSubmitting}
                icon={<Mail className="size-3" aria-hidden="true" />}
              >
                Request email change
              </Button>
            </form>
          </div>

          <div className="rounded-md border border-border bg-background/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
                <KeyRound
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Password
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Re-enter the current password before setting a new one.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="mt-5 grid gap-3">
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <Button
                type="submit"
                variant="secondary"
                loading={auth.isSubmitting}
                disabled={auth.isSubmitting}
                icon={<KeyRound className="size-3" aria-hidden="true" />}
              >
                Change password
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-border bg-background/40 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Linked wallets
              </p>
              <h3 className="mt-2 font-semibold">Owner wallet links</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                The primary wallet remains mirrored to the legacy profile field
                used by current agent and dWallet routes.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <WalletAccountMenu
                connectLabel="Connect wallet"
                showAppNavigation={false}
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => void runWalletAction(auth.linkConnectedWallet)}
                disabled={!hasConnectedWallet || auth.isLinkingWallet}
                loading={auth.isLinkingWallet}
                icon={<LinkIcon className="size-3" aria-hidden="true" />}
              >
                Link wallet
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {auth.accountWallets.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                <Wallet
                  className="mx-auto size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  No wallet is linked to this account yet.
                </p>
              </div>
            ) : (
              auth.accountWallets.map((linkedWallet) => (
                <div
                  key={linkedWallet.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm">
                        {shortenAddress(linkedWallet.wallet_address, 6, 6)}
                      </p>
                      {linkedWallet.is_primary ? (
                        <StatusBadge tone="success">Primary</StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                      {linkedWallet.wallet_address}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="small"
                      disabled={linkedWallet.is_primary}
                      onClick={() =>
                        void runWalletAction(() =>
                          auth.setPrimaryWallet(linkedWallet.id),
                        )
                      }
                    >
                      Set primary
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="small"
                      onClick={() =>
                        void runWalletAction(() =>
                          auth.unlinkWallet(linkedWallet.id),
                        )
                      }
                      icon={<Trash2 className="size-3" aria-hidden="true" />}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Settings"
          title="Runtime settings"
          description="These are the active client-side defaults used by the dashboard providers. Editable forms will come with the wallet and agent-control flows."
          action={<StatusBadge tone="success">Local state</StatusBadge>}
        />
      </DashboardPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <DashboardPanel key={row.label} className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
                <Settings
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-2 break-all font-mono text-sm">{row.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {row.detail}
                </p>
              </div>
            </div>
          </DashboardPanel>
        ))}
      </div>

      <DashboardPanel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Conduit connection</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              The Supabase-backed control plane is ready for the rewritten
              Conduit package to register agents, wallets, sign requests, and
              activity events.
            </p>
          </div>
          <StatusBadge tone="warning">Next</StatusBadge>
        </div>
      </DashboardPanel>
    </DashboardContent>
  );
}
