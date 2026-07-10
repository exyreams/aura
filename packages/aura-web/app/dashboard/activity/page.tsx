"use client";

import { Activity, ExternalLink, RefreshCw } from "lucide-react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { StatusBadge } from "@/components/global/StatusBadge";
import { formatAddress } from "@/lib/formatting/addresses";
import { useActivityEvents } from "@/lib/hooks/use-activity-events";
import type { ActivityEventRow } from "@/lib/supabase/types";

const severityTone: Record<
  ActivityEventRow["severity"],
  "success" | "warning" | "danger" | "neutral"
> = {
  info: "neutral",
  success: "success",
  warning: "warning",
  error: "danger",
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export default function ActivityPage() {
  const eventsQuery = useActivityEvents();
  const events = eventsQuery.data ?? [];

  return (
    <DashboardContent>
      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Activity"
          title="Control-plane event trail"
          description="Events are read from Supabase and are ready for Conduit, wallet syncs, proposals, owner approvals, and settlement writers."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void eventsQuery.refetch()}
              disabled={eventsQuery.isFetching}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh events
            </Button>
          }
        />
      </DashboardPanel>

      {eventsQuery.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((item) => (
            <DashboardPanel key={item} className="h-28 animate-pulse" />
          ))}
        </div>
      ) : eventsQuery.isError ? (
        <DashboardErrorState
          title="Could not load activity events"
          description="Check the owner session and the activity_events RLS policy."
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : events.length === 0 ? (
        <DashboardEmptyState
          icon={Activity}
          title="No activity yet"
          description="Once Conduit or wallet-control writers emit events, this feed will show the exact request, approval, proposal, and settlement trail."
        />
      ) : (
        <div className="grid gap-3">
          {events.map((event) => (
            <DashboardPanel key={event.id} className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised">
                      <Activity
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <StatusBadge tone={severityTone[event.severity]}>
                      {event.severity}
                    </StatusBadge>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {event.event_kind}
                    </span>
                  </div>

                  <h2 className="mt-4 text-base font-semibold">
                    {event.title}
                  </h2>
                  {event.summary ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {event.summary}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2 text-sm lg:min-w-64">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-right">
                      {formatTimestamp(event.created_at)}
                    </span>
                  </div>
                  {event.treasury_pda ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Treasury</span>
                      <span className="font-mono">
                        {formatAddress(event.treasury_pda)}
                      </span>
                    </div>
                  ) : null}
                  {event.proposal_id ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Proposal</span>
                      <span className="font-mono">
                        {formatAddress(event.proposal_id)}
                      </span>
                    </div>
                  ) : null}
                  {event.tx_signature ? (
                    <a
                      href={explorerUrl(event.tx_signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 font-medium transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Explorer
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </DashboardPanel>
          ))}
        </div>
      )}
    </DashboardContent>
  );
}
