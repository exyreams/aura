"use client";

import { Settings } from "lucide-react";
import {
  DashboardContent,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useAppSettings } from "@/lib/hooks";

export default function SettingsPage() {
  const settings = useAppSettings();
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

  return (
    <DashboardContent>
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
