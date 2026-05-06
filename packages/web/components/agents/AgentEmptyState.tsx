"use client";

import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/global";

interface AgentEmptyStateProps {
  onCreateClick: () => void;
}

export function AgentEmptyState({ onCreateClick }: AgentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-border py-16 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-border bg-(--hover-bg) mb-4">
        <Bot className="h-7 w-7 text-(--text-muted)" />
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
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={onCreateClick}
      >
        Create First Agent
      </Button>
    </div>
  );
}
