import { Activity } from "lucide-react";
import { StatusBadge } from "@/components/global/StatusBadge";

export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Activity
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Control-plane activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          This feed will subscribe to Supabase activity events emitted by
          Conduit, wallet syncs, proposals, and owner approvals.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Activity
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="font-semibold">Realtime feed pending</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The table and RLS policy are in the migration; the subscription UI
              comes with the Conduit event writer.
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
