"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { FieldGroup } from "@/components/global/FieldGroup";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { Tooltip } from "@/components/global/Tooltip";
import {
  AGENT_SCOPE_OPTIONS,
  type AgentScope,
  DEFAULT_AGENT_SCOPES,
  isAgentScope,
} from "@/lib/agents/scopes";
import type { AgentKeypair } from "@/lib/hooks";
import type { AgentSessionRow } from "@/lib/supabase/types";

interface UpdateAgentScopesResponse {
  session: AgentSessionRow;
}

function normalizeEditableScopes(scopes: string[]): AgentScope[] {
  const valid = scopes.filter(isAgentScope);
  return Array.from(new Set(["read", ...valid])) as AgentScope[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not update agent scopes.";
}

async function updateAgentScopes(agentId: string, scopes: AgentScope[]) {
  const response = await fetch(`/api/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes }),
  });
  const payload = (await response.json()) as
    | UpdateAgentScopesResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Could not update agent scopes.",
    );
  }

  return payload as UpdateAgentScopesResponse;
}

export function EditAgentScopesModal({
  agent,
  onClose,
}: {
  agent: AgentKeypair | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedScopes, setSelectedScopes] =
    useState<AgentScope[]>(DEFAULT_AGENT_SCOPES);
  const [validationError, setValidationError] = useState<string | null>(null);
  const originalScopes = useMemo(
    () =>
      agent ? normalizeEditableScopes(agent.scopes) : DEFAULT_AGENT_SCOPES,
    [agent],
  );
  const hasChanges =
    selectedScopes.length !== originalScopes.length ||
    selectedScopes.some((scope) => !originalScopes.includes(scope));

  useEffect(() => {
    if (!agent) {
      return;
    }

    setSelectedScopes(normalizeEditableScopes(agent.scopes));
    setValidationError(null);
  }, [agent]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agent) {
        throw new Error("Choose an agent to update.");
      }

      if (!selectedScopes.includes("read")) {
        throw new Error("Read session is required.");
      }

      return updateAgentScopes(agent.id, selectedScopes);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      toast.success("Agent scopes updated", {
        description: `${agent?.label ?? "Signer agent"} capabilities are now current.`,
      });
      onClose();
    },
    onError: (error) => {
      setValidationError(getErrorMessage(error));
    },
  });

  const toggleScope = (scope: AgentScope, checked: boolean) => {
    setValidationError(null);

    if (scope === "read") {
      return;
    }

    setSelectedScopes((current) => {
      if (checked) {
        return Array.from(new Set(["read", ...current, scope])) as AgentScope[];
      }

      return current.filter((candidate) => candidate !== scope);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    try {
      await mutation.mutateAsync();
    } catch {
      // React Query owns the visible error state.
    }
  };

  const close = () => {
    if (mutation.isPending) {
      return;
    }

    onClose();
  };

  return (
    <Modal
      isOpen={Boolean(agent)}
      onClose={close}
      ariaLabelledBy="edit-agent-scopes-title"
      ariaDescribedBy="edit-agent-scopes-description"
      className="sm:max-w-xl"
    >
      <form onSubmit={handleSubmit} className="grid gap-5 pt-2 pr-8">
        <div>
          <h2 id="edit-agent-scopes-title" className="text-lg font-semibold">
            Edit agent scopes
          </h2>
          <p
            id="edit-agent-scopes-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            Scopes control what the runtime token can request from AURA Web and
            Conduit-compatible flows.
          </p>
        </div>

        {agent ? (
          <div className="rounded-sm border border-border bg-background p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Signer agent
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-foreground">
                {agent.label}
              </span>
              <StatusBadge
                tone={agent.status === "active" ? "success" : "warning"}
              >
                {agent.status}
              </StatusBadge>
            </div>
          </div>
        ) : null}

        <FieldGroup
          label="Runtime capabilities"
          description="Read session is required. Enable transfer or proposal scopes only when this agent should be allowed to create those requests."
        >
          <div className="grid gap-2">
            {AGENT_SCOPE_OPTIONS.map((scope) => {
              const checked = selectedScopes.includes(scope.value);
              const required = scope.value === "read";
              const scopeControl = (
                <Checkbox
                  key={scope.value}
                  checked={checked}
                  disabled={required || mutation.isPending}
                  onChange={(nextChecked) =>
                    toggleScope(scope.value, nextChecked)
                  }
                  className="rounded-sm border border-border bg-background p-3"
                >
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          required
                            ? "text-sm font-medium text-muted-foreground"
                            : "text-sm font-medium text-foreground"
                        }
                      >
                        {scope.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {scope.value}
                      </span>
                      {required ? (
                        <StatusBadge tone="neutral">required</StatusBadge>
                      ) : null}
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {scope.description}
                    </span>
                  </span>
                </Checkbox>
              );

              return required ? (
                <Tooltip
                  key={scope.value}
                  content="Read session is required for every runtime token."
                  className="w-full"
                >
                  <span className="block w-full">{scopeControl}</span>
                </Tooltip>
              ) : (
                <span key={scope.value}>{scopeControl}</span>
              );
            })}
          </div>
        </FieldGroup>

        {validationError ? (
          <div className="flex items-start gap-2 rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{validationError}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!hasChanges || agent?.status === "revoked"}
          >
            Save scopes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
