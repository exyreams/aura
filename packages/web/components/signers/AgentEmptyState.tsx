"use client";

import { Button } from "@/components/global";
import { Plus, Users } from "@/components/icons";

interface AgentEmptyStateProps {
  onCreateClick: () => void;
}

export function AgentEmptyState({ onCreateClick }: AgentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-border py-16 px-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-sm border border-border bg-(--hover-bg) mb-4">
        <Users className="size-7 text-(--text-muted)" animateOnHover />
      </div>
      <h3 className="text-sm font-semibold text-(--text-main) mb-1">
        No agents yet
      </h3>
      <p className="text-sm text-(--text-muted) max-w-xs mb-6">
        Create an agent keypair to sign backend-assisted treasury actions.
      </p>
      <Button
        variant="primary"
        size="small"
        icon={<Plus className="size-3.5" animateOnHover />}
        onClick={onCreateClick}
      >
        Create First Agent
      </Button>
    </div>
  );
}
