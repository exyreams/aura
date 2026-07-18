"use client";

import { ChevronDown } from "lucide-react";
import { ActivityDetailPanel } from "@/components/activity/ActivityDetailPanel";
import {
  ActivityBadge,
  FAMILY_ICONS,
  familyBadgeLabel,
  sessionBadgeLabel,
  sourceBadgeLabel,
} from "@/components/activity/activity-ui";
import {
  type ActivityReferenceMap,
  formatActivityRelativeTime,
  getActivityFamily,
  getActivityFamilyLabel,
  getActivityFamilyTone,
  getActivityOrigin,
  getActivityOriginLabel,
  getActivityRelatedRecords,
  getActivitySessionFilter,
  getActivitySessionLabel,
  getActivitySeverityTone,
  getActivitySourceTone,
} from "@/lib/activity";
import type { ActivityEventRow } from "@/lib/supabase/types";
import { cn, shortenAddress } from "@/lib/utils";

interface ActivityRowProps {
  event: ActivityEventRow;
  refs: ActivityReferenceMap;
  expanded: boolean;
  onToggle: () => void;
}

function timelineMeta(event: ActivityEventRow, refs: ActivityReferenceMap) {
  const family = getActivityFamilyLabel(event);
  const origin = getActivityOriginLabel(event);
  const session = getActivitySessionLabel(event, refs);

  const pieces = [
    event.event_kind,
    formatActivityRelativeTime(event.created_at),
  ];

  if (session && session !== "No session") {
    pieces.push(session);
  }

  if (origin) {
    pieces.push(origin);
  }

  if (family) {
    pieces.push(family);
  }

  return pieces.join(" · ");
}

export function ActivityRow({
  event,
  refs,
  expanded,
  onToggle,
}: ActivityRowProps) {
  const family = getActivityFamily(event);
  const familyTone = getActivityFamilyTone(family);
  const severityTone = getActivitySeverityTone(event.severity);
  const origin = getActivityOrigin(event);
  const originTone = getActivitySourceTone(origin);
  const sessionFilter = getActivitySessionFilter(event, refs);
  const FamilyIcon = FAMILY_ICONS[family];
  const wallet = event.wallet_id
    ? (refs.walletsById.get(event.wallet_id) ?? null)
    : null;
  const session = event.agent_session_id
    ? (refs.sessionsById.get(event.agent_session_id) ?? null)
    : null;
  const request = event.proposal_id
    ? (refs.requestsById.get(event.proposal_id) ?? null)
    : null;
  const relatedRecords = getActivityRelatedRecords(event, refs);
  const headline = event.title || getActivityFamilyLabel(event);
  const summary = event.summary ?? event.title;
  const rightRef = shortenAddress(event.id, 5, 5);
  const hasActions =
    wallet !== null ||
    session !== null ||
    origin === "conduit" ||
    event.tx_signature !== null;
  const hasDetail =
    relatedRecords.length > 0 || Boolean(request?.message) || hasActions;

  return (
    <div className="group/activity flex gap-3 sm:gap-4">
      <div className="flex w-7 shrink-0 flex-col items-center sm:w-8">
        <div className="z-10 mt-1 flex size-6 shrink-0 items-center justify-center sm:size-7">
          <div className="flex size-6 items-center justify-center rounded-full border border-border bg-surface-raised transition-colors group-hover/activity:border-primary/60 group-hover/activity:bg-(--hover-bg)">
            <FamilyIcon
              className="size-3.5 text-muted-foreground transition-colors group-hover/activity:text-foreground"
              aria-hidden
            />
          </div>
        </div>
        <div className="mt-1 min-h-[24px] w-px flex-1 bg-border" />
      </div>

      <div className="min-w-0 flex-1 pb-5 sm:pb-6">
        <button
          type="button"
          disabled={!hasDetail}
          aria-expanded={expanded}
          className={cn(
            "group/row -mx-2 mb-1 flex w-full items-start justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors",
            hasDetail
              ? "hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              : "cursor-default",
          )}
          onClick={() => hasDetail && onToggle()}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate font-mono text-[10px] font-bold uppercase tracking-wide text-foreground transition-colors group-hover/row:text-(--secondary) sm:text-[11px]">
              {headline}
            </span>
            <ActivityBadge tone={severityTone}>{event.severity}</ActivityBadge>
            <ActivityBadge tone={familyTone}>
              {familyBadgeLabel(family)}
            </ActivityBadge>
            <ActivityBadge tone={originTone}>
              {sourceBadgeLabel(origin)}
            </ActivityBadge>
            {sessionFilter !== "none" ? (
              <ActivityBadge tone="neutral">
                {sessionBadgeLabel(sessionFilter)}
              </ActivityBadge>
            ) : null}
          </div>
          <div className="ml-auto flex min-h-6 shrink-0 items-center gap-2 pl-4 text-right">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover/row:text-foreground">
              {rightRef}
            </span>
            {hasDetail ? (
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-[color,transform] group-hover/row:text-foreground",
                  expanded && "rotate-180",
                )}
                aria-hidden
              />
            ) : null}
          </div>
        </button>

        <div className="grid gap-1.5">
          <p className="font-mono text-[10px] text-muted-foreground">
            {timelineMeta(event, refs)}
          </p>
          {summary ? (
            <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
              {summary}
            </p>
          ) : null}
        </div>

        <ActivityDetailPanel
          event={event}
          expanded={expanded && hasDetail}
          hasSessionAction={session !== null}
          hasWalletAction={wallet !== null}
          isConduitEvent={origin === "conduit"}
          records={relatedRecords}
          requestMessage={request?.message ?? null}
          summary={summary}
        />
      </div>
    </div>
  );
}
