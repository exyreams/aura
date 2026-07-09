import { Settings } from "lucide-react";
import { StatusBadge } from "@/components/global/StatusBadge";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Runtime settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          RPC, program ID, and Conduit connection settings will live here once
          the runtime package is restored.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Settings
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="font-semibold">Configuration pending</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Defaults use devnet and the configured Supabase project for the
              first wallet-control slice.
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
