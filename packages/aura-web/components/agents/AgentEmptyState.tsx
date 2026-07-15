"use client";

import { Button } from "@/components/global/Button";
import { Plus, Users } from "@/components/icons";

export function AgentEmptyState({
  onCreateClick,
}: {
  onCreateClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border px-8 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-sm border border-border bg-muted">
        <Users className="size-7 text-muted-foreground" animateOnHover />
      </div>
      <h3 className="mb-1 text-sm font-semibold">No agents yet</h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        Create an agent keypair to sign backend-assisted treasury actions.
      </p>
      <Button
        type="button"
        size="small"
        icon={<Plus className="size-3.5" animateOnHover />}
        onClick={onCreateClick}
      >
        Create First Agent
      </Button>
    </div>
  );
}
