const STATUS_LABELS: Record<string, string> = {
  new: "New",
  beta: "Beta",
  deprecated: "Deprecated",
  experimental: "Experimental",
};

/**
 * Small status pill used both in the sidebar (via the fumadocs status-badges
 * plugin) and inline in MDX content (exported as `New` below).
 */
export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const label = STATUS_LABELS[key] ?? status;
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase leading-none tracking-wide text-emerald-600 dark:text-emerald-400">
      {label}
    </span>
  );
}

/** Inline "New" badge for use next to new instructions/headings in MDX. */
export function New() {
  return <StatusBadge status="new" />;
}
