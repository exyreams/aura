const SKELETON_ROW_IDS = [
  "activity-skeleton-1",
  "activity-skeleton-2",
  "activity-skeleton-3",
  "activity-skeleton-4",
  "activity-skeleton-5",
] as const;

export function ActivityLoadingState() {
  return (
    <div className="space-y-0 py-2">
      {SKELETON_ROW_IDS.map((rowId, index) => (
        <div key={rowId} className="flex gap-3 sm:gap-4">
          <div className="flex w-7 shrink-0 flex-col items-center sm:w-8">
            <div className="mt-1 size-6 shrink-0 rounded-full border border-border bg-background/60 sm:size-7" />
            {index < SKELETON_ROW_IDS.length - 1 ? (
              <div className="mt-1 min-h-[60px] w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2 pb-8 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-3 w-28 rounded bg-background/60 sm:w-36" />
              <div className="h-4 w-14 rounded-sm bg-background/60" />
              <div className="h-4 w-14 rounded-sm bg-background/60" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="h-2.5 w-16 rounded bg-background/60 sm:w-20" />
              <div className="h-2.5 w-24 rounded bg-background/60 sm:w-28" />
              <div className="h-2.5 w-16 rounded bg-background/60 sm:w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
