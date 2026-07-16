"use client";

import { Keypair } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clipboard, Download, Shuffle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { FieldGroup } from "@/components/global/FieldGroup";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Textarea } from "@/components/global/Textarea";
import { KeyRound } from "@/components/icons";
import {
  AGENT_SCOPE_OPTIONS,
  type AgentScope,
  DEFAULT_AGENT_SCOPES,
} from "@/lib/agents/scopes";
import type { AgentSessionRow } from "@/lib/supabase/types";

const WORDS = [
  "sentinel",
  "phantom",
  "cipher",
  "nexus",
  "apex",
  "delta",
  "sigma",
  "omega",
  "prime",
  "stealth",
  "forge",
  "relay",
  "pulse",
  "vault",
  "specter",
  "cobalt",
  "raven",
  "onyx",
  "flare",
  "neural",
  "cortex",
  "synapse",
  "gradient",
  "sparse",
  "logical",
  "causal",
  "bayesian",
  "abstract",
  "coherent",
];

interface CreateAgentResponse {
  session: AgentSessionRow;
  agentToken: string;
  runtimeIdentity: RuntimeIdentity | null;
}

interface RuntimeIdentity {
  agentId: string;
  label: string;
  publicKey: string;
  secretKey: number[];
  createdAt: string;
}

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (session: AgentSessionRow) => void;
}

function generateAgentId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.random().toString(36).slice(2, 6);
  return `aura-${word}-${suffix}`;
}

function titleFromAgentId(value: string) {
  return value
    .split("-")
    .slice(0, -1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function validateAgentId(value: string) {
  const agentId = value.trim();
  if (!agentId) return "Agent ID is required.";
  if (!/^[A-Za-z0-9._:-]+$/.test(agentId)) {
    return "Use letters, numbers, dots, underscores, colons, or dashes.";
  }
  if (new TextEncoder().encode(agentId).length > 64) {
    return "Agent ID must be 64 bytes or fewer.";
  }
  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create agent.";
}

function createRuntimeIdentity(
  agentId: string,
  label: string,
): RuntimeIdentity {
  const keypair = Keypair.generate();
  return {
    agentId,
    label,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey),
    createdAt: new Date().toISOString(),
  };
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

async function createAgent(input: {
  agentId: string;
  label: string;
  authorityPublicKey: string;
  scopes: AgentScope[];
}) {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: input.agentId,
      label: input.label,
      authorityPublicKey: input.authorityPublicKey,
      scopes: input.scopes,
      expiresInDays: "never",
    }),
  });
  const body = (await response.json()) as
    | Omit<CreateAgentResponse, "runtimeIdentity">
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in body && body.error ? body.error : "Could not create agent.",
    );
  }

  return body as Omit<CreateAgentResponse, "runtimeIdentity">;
}

export function CreateAgentModal({
  open,
  onClose,
  onCreated,
}: CreateAgentModalProps) {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<CreateAgentResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [selectedScopes, setSelectedScopes] =
    useState<AgentScope[]>(DEFAULT_AGENT_SCOPES);

  const createMutation = useMutation({
    mutationFn: async () => {
      const nextAgentId = agentId.trim();
      const nextLabel = label.trim() || titleFromAgentId(nextAgentId);
      const identity = createRuntimeIdentity(nextAgentId, nextLabel);
      const result = await createAgent({
        agentId: nextAgentId,
        label: nextLabel,
        authorityPublicKey: identity.publicKey,
        scopes: selectedScopes,
      });

      return {
        ...result,
        runtimeIdentity: identity,
      };
    },
    onSuccess: async (result) => {
      setCreated(result);
      onCreated?.(result.session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
  });

  const resetAndClose = () => {
    if (createMutation.isPending) return;
    onClose();
    window.setTimeout(() => {
      setAgentId("");
      setLabel("");
      setValidationError(null);
      setTouched(false);
      setCreated(null);
      setCopied(false);
      setDownloaded(false);
      setSelectedScopes(DEFAULT_AGENT_SCOPES);
      createMutation.reset();
    }, 160);
  };

  const applyGenerated = () => {
    const generated = generateAgentId();
    setAgentId(generated);
    setLabel(titleFromAgentId(generated));
    setValidationError(null);
    setTouched(false);
  };

  const handleAgentIdChange = (value: string) => {
    setAgentId(value);
    if (touched) setValidationError(validateAgentId(value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const error = validateAgentId(agentId);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    await createMutation.mutateAsync();
  };

  const toggleScope = (scope: AgentScope, checked: boolean) => {
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

  const copyToken = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.agentToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const downloadIdentity = () => {
    if (!created?.runtimeIdentity) return;
    downloadJson(`${created.runtimeIdentity.agentId}.aura-agent.json`, {
      format: "aura-agent-runtime-keypair-v1",
      ...created.runtimeIdentity,
      bearerToken: created.agentToken,
      warning:
        "This file contains runtime credentials. Store it in the agent runtime or a key manager.",
    });
    setDownloaded(true);
  };

  const submitError =
    validationError ??
    (createMutation.isError ? getErrorMessage(createMutation.error) : null);

  return (
    <Modal
      isOpen={open}
      onClose={resetAndClose}
      ariaLabelledBy="create-agent-title"
      ariaDescribedBy="create-agent-description"
      className="sm:max-w-xl"
    >
      <div className="grid gap-5 pt-2">
        <div className="flex flex-col items-center pr-8 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-sm border border-border bg-background">
            {created ? (
              <Check className="size-5 text-success" aria-hidden="true" />
            ) : (
              <KeyRound
                className="size-5 text-foreground"
                animateOnHover
                aria-hidden="true"
              />
            )}
          </div>
          <h2
            id="create-agent-title"
            className="text-lg font-semibold tracking-tight"
          >
            {created ? "Agent ready" : "New Signer Agent"}
          </h2>
          <p
            id="create-agent-description"
            className="mt-1.5 max-w-[280px] text-xs leading-5 text-muted-foreground"
          >
            {created
              ? "Download the runtime identity now. The token and secret key are shown once."
              : "Generate the runtime keypair used as the future ai_authority. Treasury binding happens in the wallet-signed on-chain flow."}
          </p>
        </div>

        {created ? (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-sm border border-success/30 bg-success/10 p-3">
              <div className="flex items-center gap-2">
                <Check className="size-3.5 text-success" aria-hidden="true" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                  Runtime signer created
                </p>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                The on-chain treasury is still unbound. Use this authority when
                the wallet signs treasury creation.
              </p>
            </div>

            <div className="rounded-sm border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Authority public key
                  </p>
                  <p className="mt-2 truncate font-mono text-xs">
                    {created.runtimeIdentity?.publicKey}
                  </p>
                </div>
                <span className="rounded-sm border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  ai_authority
                </span>
              </div>
            </div>

            <Textarea
              label="Runtime token"
              value={created.agentToken}
              readOnly
              className="min-h-24 resize-none font-mono text-xs"
            />

            <div className="rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              AURA stores the public authority and hashed token only. The secret
              key stays in the downloaded runtime identity.
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                onClick={copyToken}
                icon={<Clipboard className="size-4" aria-hidden="true" />}
              >
                {copied ? "Copied" : "Copy token"}
              </Button>
              <Button
                type="button"
                onClick={downloadIdentity}
                icon={<Download className="size-4" aria-hidden="true" />}
              >
                Download
              </Button>
            </div>
            {downloaded ? (
              <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                Identity downloaded
              </p>
            ) : null}
            <Button type="button" variant="secondary" onClick={resetAndClose}>
              Close
            </Button>
          </div>
        ) : (
          <form id="create-agent-form" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4">
              <Input
                id="new-agent-id"
                label="Agent ID"
                value={agentId}
                onChange={(event) => handleAgentIdChange(event.target.value)}
                onBlur={() => {
                  setTouched(true);
                  setValidationError(validateAgentId(agentId));
                }}
                placeholder="aura-sentinel-7f3a"
                autoComplete="off"
                spellCheck={false}
                disabled={createMutation.isPending}
                error={validationError}
                helperText="Up to 64 bytes. Use the same ID when creating the on-chain treasury."
                required
                labelAction={
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={applyGenerated}
                    disabled={createMutation.isPending}
                  >
                    <Shuffle className="size-3" aria-hidden="true" />
                    Generate
                  </Button>
                }
              />

              <Input
                id="new-agent-label"
                label="Label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Aura Sentinel"
                autoComplete="off"
                spellCheck={false}
                disabled={createMutation.isPending}
              />

              <FieldGroup
                label="Runtime scopes"
                description="Read session is required. Add transfer permission only when this signer should be able to request wallet transfers."
              >
                <div className="grid gap-2">
                  {AGENT_SCOPE_OPTIONS.map((scope) => {
                    const checked = selectedScopes.includes(scope.value);
                    const required = scope.value === "read";

                    return (
                      <Checkbox
                        key={scope.value}
                        checked={checked}
                        disabled={required || createMutation.isPending}
                        onChange={(nextChecked) =>
                          toggleScope(scope.value, nextChecked)
                        }
                        className="rounded-sm border border-border bg-background p-3"
                      >
                        <span className="grid gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
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
                  })}
                </div>
              </FieldGroup>

              <div className="rounded-sm border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                This creates the signer identity and session token only. The
                treasury account and dWallet registration are wallet-signed
                on-chain actions.
              </div>

              {submitError && !validationError ? (
                <div className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {submitError}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetAndClose}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={createMutation.isPending}>
                  Create Agent
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
