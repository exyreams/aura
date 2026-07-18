"use client";

import { ActivityFeed } from "@/components/activity/ActivityFeed";
import {
  useActivityEvents,
  useAgentSessions,
  useSignRequests,
  useWalletRegistry,
} from "@/lib/hooks";

export default function ActivityPage() {
  const eventsQuery = useActivityEvents();
  const sessionsQuery = useAgentSessions();
  const walletsQuery = useWalletRegistry();
  const requestsQuery = useSignRequests();

  const error =
    eventsQuery.error instanceof Error
      ? eventsQuery.error.message
      : sessionsQuery.error instanceof Error
        ? sessionsQuery.error.message
        : walletsQuery.error instanceof Error
          ? walletsQuery.error.message
          : requestsQuery.error instanceof Error
            ? requestsQuery.error.message
            : null;

  return (
    <ActivityFeed
      events={eventsQuery.data ?? []}
      wallets={walletsQuery.data ?? []}
      sessions={sessionsQuery.data ?? []}
      requests={requestsQuery.data ?? []}
      isLoading={
        eventsQuery.isLoading ||
        sessionsQuery.isLoading ||
        walletsQuery.isLoading ||
        requestsQuery.isLoading
      }
      isFetching={
        eventsQuery.isFetching ||
        sessionsQuery.isFetching ||
        walletsQuery.isFetching ||
        requestsQuery.isFetching
      }
      error={error}
      onRefresh={() => {
        void Promise.all([
          eventsQuery.refetch(),
          sessionsQuery.refetch(),
          walletsQuery.refetch(),
          requestsQuery.refetch(),
        ]);
      }}
    />
  );
}
