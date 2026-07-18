"use client";

import { ActivityRow } from "@/components/activity/ActivityRow";
import type { ActivityReferenceMap } from "@/lib/activity";
import type { ActivityEventRow } from "@/lib/supabase/types";

interface ActivityTimelineProps {
  events: ActivityEventRow[];
  refs: ActivityReferenceMap;
  expandedId: string | null;
  onToggleEvent: (eventId: string) => void;
}

export function ActivityTimeline({
  events,
  refs,
  expandedId,
  onToggleEvent,
}: ActivityTimelineProps) {
  return (
    <div className="grid gap-0">
      {events.map((event) => (
        <ActivityRow
          key={event.id}
          event={event}
          refs={refs}
          expanded={expandedId === event.id}
          onToggle={() => onToggleEvent(event.id)}
        />
      ))}
    </div>
  );
}
