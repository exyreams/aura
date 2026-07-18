"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  ACTIVITY_FAMILY_OPTIONS,
  ACTIVITY_ORIGIN_OPTIONS,
  ACTIVITY_SESSION_OPTIONS,
  type ActivityFilterState,
} from "@/lib/activity";

type ActivityFilterKey = keyof ActivityFilterState;

const DEFAULT_FILTERS: ActivityFilterState = {
  q: "",
  family: "all",
  session: "all",
  origin: "all",
};

function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
) {
  if (value === null) {
    return fallback;
  }

  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function useActivityQueryState() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<ActivityFilterState>(
    () => ({
      q: searchParams.get("q") ?? DEFAULT_FILTERS.q,
      family: parseEnum(
        searchParams.get("family"),
        ACTIVITY_FAMILY_OPTIONS.map((option) => option.value),
        DEFAULT_FILTERS.family,
      ),
      session: parseEnum(
        searchParams.get("session"),
        ACTIVITY_SESSION_OPTIONS.map((option) => option.value),
        DEFAULT_FILTERS.session,
      ),
      origin: parseEnum(
        searchParams.get("origin"),
        ACTIVITY_ORIGIN_OPTIONS.map((option) => option.value),
        DEFAULT_FILTERS.origin,
      ),
    }),
    [searchParams],
  );

  function updateFilters(patch: Partial<ActivityFilterState>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(patch) as Array<
      [ActivityFilterKey, string]
    >) {
      const defaultValue = DEFAULT_FILTERS[key];
      if (!value || value === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return { filters, updateFilters };
}
