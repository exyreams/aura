"use client";

import { Bot } from "lucide-react";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";

export default function AgentsPage() {
  const sessionsQuery = useAgentSessions();
  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Agents
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Agent sessions
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Conduit-approved sessions will be listed here after the Supabase
          device-flow rewrite lands.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold">
              {sessionsQuery.isLoading
                ? "Loading sessions"
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Session revocation and scope controls are planned for the Conduit
              phase.
            </p>
          </div>
          <StatusBadge className="ml-auto" tone="warning">
            Planned
          </StatusBadge>
        </div>
      </section>
    </div>
  );
}
