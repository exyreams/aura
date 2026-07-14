"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Clipboard, KeyRound, Shuffle } from "lucide-react";
import { useState } from "react";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { Dropdown } from "@/components/global/Dropdown";
import { FieldGroup } from "@/components/global/FieldGroup";
import { Input } from "@/components/global/Input";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Textarea } from "@/components/global/Textarea";
import {
  AGENT_SCOPE_OPTIONS,
  type AgentScope,
  DEFAULT_AGENT_SCOPES,
} from "@/lib/agents/scopes";
import type { AgentSessionRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const WORDS = [
  "sentinel",
  "cipher",
  "nexus",
  "delta",
  "forge",
  "relay",
  "vault",
  "cobalt",
  "neural",
  "cortex",
  "gradient",
  "bayesian",
  "coherent",
];

const expiryOptions = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "never", label: "No expiry" },
];

interface CreateAgentResponse {
  session: AgentSessionRow;
  agentToken: string;
}

function generateAgentId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.random().toString(36).slice(2, 6);
  return `aura-${word}-${suffix}`;
}

function toTitle(value: string) {
  return value
    .split("-")
    .slice(0, -1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create agent.";
}

async function createAgent(input: {
  agentId: string;
  label: string;
  treasuryPda: string;
  scopes: AgentScope[];
  expiresInDays: string;
}) {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as
    | CreateAgentResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in body && body.error ? body.error : "Could not create agent.",
    );
  }

  return body as CreateAgentResponse;
}

export function CreateAgentForm() {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [treasuryPda, setTreasuryPda] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [selectedScopes, setSelectedScopes] =
    useState<AgentScope[]>(DEFAULT_AGENT_SCOPES);
  const [createdAgent, setCreatedAgent] = useState<CreateAgentResponse | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createAgent,
    onSuccess: async (result) => {
      setCreatedAgent(result);
      setCopied(false);
      setAgentId("");
      setLabel("");
      setTreasuryPda("");
      setSelectedScopes(DEFAULT_AGENT_SCOPES);
      setExpiresInDays("30");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
  });

  const applyGenerated = () => {
    const generated = generateAgentId();
    setAgentId(generated);
    setLabel(toTitle(generated));
    setValidationError(null);
  };

  const toggleScope = (scope: AgentScope) => {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextAgentId = agentId.trim();

    if (!nextAgentId) {
      setValidationError("Agent ID is required.");
      return;
    }

    if (new TextEncoder().encode(nextAgentId).length > 64) {
      setValidationError("Agent ID must be 64 bytes or fewer.");
      return;
    }

    if (selectedScopes.length === 0) {
      setValidationError("Select at least one scope.");
      return;
    }

    setValidationError(null);
    try {
      await mutation.mutateAsync({
        agentId: nextAgentId,
        label,
        treasuryPda,
        scopes: selectedScopes,
        expiresInDays,
      });
    } catch {
      // React Query owns the error state rendered below.
    }
  };

  const copyToken = async () => {
    if (!createdAgent) {
      return;
    }

    await navigator.clipboard.writeText(createdAgent.agentToken);
    setCopied(true);
  };

  const submitError = validationError ?? getErrorMessage(mutation.error);

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        eyebrow="Create"
        title="Create agent session"
        description="Create a Conduit-compatible bearer token now. Later, the CLI/device flow will create the same session rows through owner approval."
        action={<StatusBadge tone="success">Web minted</StatusBadge>}
      />

      <form className="mt-5 grid gap-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4">
            <Input
              id="agent-id"
              label="Agent ID"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              placeholder="aura-sentinel-7f3a"
              autoComplete="off"
              disabled={mutation.isPending}
              required
              helperText="Use a stable ID your agent runtime can recognize later."
              labelAction={
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={applyGenerated}
                  disabled={mutation.isPending}
                >
                  <Shuffle className="size-3" aria-hidden="true" />
                  Generate
                </Button>
              }
            />

            <Input
              id="agent-label"
              label="Label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Treasury operator"
              autoComplete="off"
              disabled={mutation.isPending}
            />

            <Input
              id="agent-treasury"
              label="Treasury PDA"
              value={treasuryPda}
              onChange={(event) => setTreasuryPda(event.target.value)}
              placeholder="Optional until treasury registry is wired"
              autoComplete="off"
              disabled={mutation.isPending}
              className="font-mono"
            />

            <Dropdown
              label="Expiry"
              options={expiryOptions}
              value={expiresInDays}
              onChange={setExpiresInDays}
              disabled={mutation.isPending}
            />
          </div>

          <FieldGroup label="Scopes">
            {AGENT_SCOPE_OPTIONS.map((scope) => {
              const checked = selectedScopes.includes(scope.value);

              return (
                <Checkbox
                  key={scope.value}
                  checked={checked}
                  onChange={() => toggleScope(scope.value)}
                  disabled={mutation.isPending}
                  className={cn(
                    "rounded-md border border-border bg-background/40 p-3 transition-colors",
                    checked && "border-primary/50 bg-primary/5",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <KeyRound className="size-3.5" aria-hidden="true" />
                      {scope.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {scope.description}
                    </span>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {scope.value}
                    </span>
                  </span>
                </Checkbox>
              );
            })}
          </FieldGroup>
        </div>

        {validationError || mutation.isError ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {submitError}
          </div>
        ) : null}

        {createdAgent ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-warning" aria-hidden="true" />
                  <h3 className="font-semibold text-warning">
                    Agent token created
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-warning/90">
                  This bearer token is shown once. Store it in your agent
                  runtime or OS keychain before leaving this page.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={copyToken}>
                <Clipboard className="size-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy token"}
              </Button>
            </div>
            <Textarea
              readOnly
              value={createdAgent.agentToken}
              containerClassName="mt-4"
              className="resize-none border-warning/30 font-mono text-xs"
              aria-label="Created agent bearer token"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Tokens are hashed server-side. The browser never writes secret rows
            directly.
          </p>
          <Button
            type="submit"
            disabled={mutation.isPending}
            icon={<Bot className="size-4" aria-hidden="true" />}
            loading={mutation.isPending}
          >
            Create agent
          </Button>
        </div>
      </form>
    </DashboardPanel>
  );
}
