import { Activity } from "lucide-react";
import { Button } from "@/components/global/Button";

interface ActivityEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function ActivityEmptyState({
  hasFilters,
  onClearFilters,
}: ActivityEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/40 px-6 py-16 text-center">
      <Activity className="size-10 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-4 text-base font-semibold">
        {hasFilters ? "No matching activity" : "No activity yet"}
      </h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {hasFilters
          ? "Adjust the filters or search box to inspect another slice of the control-plane trail."
          : "Once Conduit or wallet-control writers emit events, the feed will appear here."}
      </p>
      {hasFilters ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
