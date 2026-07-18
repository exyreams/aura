"use client";

import { RefreshCw, Search } from "lucide-react";
import { m } from "motion/react";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { Input } from "@/components/global/Input";
import {
  ACTIVITY_FAMILY_OPTIONS,
  ACTIVITY_ORIGIN_OPTIONS,
  ACTIVITY_SESSION_OPTIONS,
  type ActivityFamilyFilter,
  type ActivityFilterState,
} from "@/lib/activity";
import { cn } from "@/lib/utils";

interface ActivityFiltersProps {
  filters: ActivityFilterState;
  familyCounts: Record<ActivityFamilyFilter, number>;
  hasFilters: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onClearFilters: () => void;
  onUpdateFilters: (patch: Partial<ActivityFilterState>) => void;
}

export function ActivityFilters({
  filters,
  familyCounts,
  hasFilters,
  isFetching,
  onRefresh,
  onClearFilters,
  onUpdateFilters,
}: ActivityFiltersProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(20rem,1fr)_14rem_11rem_auto_auto] xl:items-end">
        <Input
          label="Search activity"
          placeholder="Search requests, sessions, wallets, ids"
          value={filters.q}
          containerClassName="w-full"
          onChange={(event) =>
            onUpdateFilters({ q: event.currentTarget.value })
          }
          rightAdornment={
            filters.q ? (
              <button
                type="button"
                onClick={() => onUpdateFilters({ q: "" })}
                className="rounded-sm px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            ) : (
              <Search className="size-4 text-muted-foreground" aria-hidden />
            )
          }
        />

        <Dropdown
          label="Session"
          options={ACTIVITY_SESSION_OPTIONS}
          value={filters.session}
          onChange={(value) =>
            onUpdateFilters({
              session: value as ActivityFilterState["session"],
            })
          }
          className="w-full"
        />

        <Dropdown
          label="Origin"
          options={ACTIVITY_ORIGIN_OPTIONS}
          value={filters.origin}
          onChange={(value) =>
            onUpdateFilters({
              origin: value as ActivityFilterState["origin"],
            })
          }
          className="w-full"
        />

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-10 px-3 text-[10px]"
            onClick={onClearFilters}
          >
            Clear
          </Button>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          disabled={isFetching}
          className="min-h-10"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="flex gap-6 overflow-x-auto border-b border-border pb-2">
        {ACTIVITY_FAMILY_OPTIONS.map((option) => {
          const selected = filters.family === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onUpdateFilters({ family: option.value })}
              aria-pressed={selected}
              className={cn(
                "relative shrink-0 pb-4 font-mono text-[11px] uppercase tracking-widest transition-colors",
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({familyCounts[option.value]})
              </span>
              {selected ? (
                <m.div
                  layoutId="activity-family-tab"
                  className="absolute right-0 bottom-0 left-0 h-[2px] bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
