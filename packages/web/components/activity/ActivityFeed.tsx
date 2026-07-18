"use client";

import { useMemo, useState } from "react";
import { ActivityEmptyState } from "@/components/activity/ActivityEmptyState";
import { ActivityErrorState } from "@/components/activity/ActivityErrorState";
import { ActivityFilters } from "@/components/activity/ActivityFilters";
import { ActivityLoadingState } from "@/components/activity/ActivityLoadingState";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { useActivityQueryState } from "@/components/activity/useActivityQueryState";
import {
  type ActivityFamilyFilter,
  type ActivityFilterState,
  type ActivityReferenceMap,
  getActivityFamily,
  matchesActivityFilters,
} from "@/lib/activity";
import type { AgentSessionWithUsage } from "@/lib/agents/session-model";
import type {
  ActivityEventRow,
  SignRequestRow,
  WalletRegistryRow,
} from "@/lib/supabase/types";

interface ActivityFeedProps {
  events: ActivityEventRow[];
  wallets: WalletRegistryRow[];
  sessions: AgentSessionWithUsage[];
  requests: SignRequestRow[];
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  error?: string | null;
}

const CLEAR_FILTERS: ActivityFilterState = {
  q: "",
  family: "all",
  session: "all",
  origin: "all",
};

export function ActivityFeed({
  events,
  wallets,
  sessions,
  requests,
  isLoading,
  isFetching,
  onRefresh,
  error,
}: ActivityFeedProps) {
  const { filters, updateFilters } = useActivityQueryState();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refs = useMemo<ActivityReferenceMap>(
    () => ({
      sessionsById: new Map(sessions.map((session) => [session.id, session])),
      walletsById: new Map(wallets.map((wallet) => [wallet.id, wallet])),
      requestsById: new Map(requests.map((request) => [request.id, request])),
    }),
    [requests, sessions, wallets],
  );

  const familyCounts = useMemo<Record<ActivityFamilyFilter, number>>(() => {
    const counts: Record<ActivityFamilyFilter, number> = {
      all: 0,
      proposals: 0,
      transfers: 0,
      sessions: 0,
      wallets: 0,
      approvals: 0,
      execution: 0,
      errors: 0,
    };

    const baseEvents = events.filter((event) =>
      matchesActivityFilters(event, refs, {
        ...filters,
        family: "all",
      }),
    );

    for (const event of baseEvents) {
      counts.all += 1;
      counts[getActivityFamily(event)] += 1;
    }

    return counts;
  }, [events, filters, refs]);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => matchesActivityFilters(event, refs, filters)),
    [events, filters, refs],
  );

  const hasFilters =
    filters.q !== "" ||
    filters.family !== "all" ||
    filters.session !== "all" ||
    filters.origin !== "all";

  function clearFilters() {
    updateFilters(CLEAR_FILTERS);
  }

  if (error) {
    return <ActivityErrorState error={error} onRefresh={onRefresh} />;
  }

  return (
    <div className="grid w-full gap-6">
      <ActivityFilters
        filters={filters}
        familyCounts={familyCounts}
        hasFilters={hasFilters}
        isFetching={isFetching}
        onClearFilters={clearFilters}
        onRefresh={onRefresh}
        onUpdateFilters={updateFilters}
      />

      {isLoading ? (
        <ActivityLoadingState />
      ) : filteredEvents.length === 0 ? (
        <ActivityEmptyState
          hasFilters={hasFilters}
          onClearFilters={clearFilters}
        />
      ) : (
        <ActivityTimeline
          events={filteredEvents}
          refs={refs}
          expandedId={expandedId}
          onToggleEvent={(eventId) =>
            setExpandedId((current) => (current === eventId ? null : eventId))
          }
        />
      )}
    </div>
  );
}
