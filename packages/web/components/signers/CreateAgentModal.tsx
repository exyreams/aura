"use client";

import { KeyRound, Shuffle } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Modal } from "@/components/global";
import { useAgents } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// name generator

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

function generateAgentId(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.random().toString(36).slice(2, 6);
  return `aura-${word}-${suffix}`;
}

// validation

function validateAgentId(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return "Agent ID is required.";
  if (new TextEncoder().encode(normalized).length > 64)
    return "Must be 64 characters or fewer.";
  return null;
}

// component

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const { createAgentMutation } = useAgents();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const applyGenerated = () => {
    const id = generateAgentId();
    setAgentId(id);
    // Derive label: drop the last 4-char hex suffix, title-case the rest
    // e.g. "aura-sentinel-7f3a" → "Aura Sentinel"
    const parts = id.split("-");
    const withoutSuffix = parts.slice(0, -1); // drop "7f3a"
    const pretty = withoutSuffix
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    setLabel(pretty);
    setValidationError(null);
    setTouched(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validateAgentId(agentId);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);

    await createAgentMutation.mutateAsync({
      agentId: agentId.trim(),
      label: label.trim() || undefined,
    });

    setAgentId("");
    setLabel("");
    setTouched(false);
    setValidationError(null);
    onClose();
  };

  const handleAgentIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAgentId(value);
    if (touched) setValidationError(validateAgentId(value));
  };

  const handleAgentIdBlur = () => {
    setTouched(true);
    setValidationError(validateAgentId(agentId));
  };

  const mutationError =
    createAgentMutation.error instanceof Error
      ? createAgentMutation.error.message
      : null;
  const submitError = !validationError ? mutationError : null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      className="max-w-sm"
      footer={
        <div className="flex flex-col gap-2 w-full">
          {submitError && <Alert variant="error" message={submitError} />}
          <div className="flex gap-2 w-full">
            <Button
              variant="secondary"
              size="medium"
              className="flex-1"
              onClick={onClose}
              disabled={createAgentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              className="flex-1"
              form="create-agent-form"
              loading={createAgentMutation.isPending}
            >
              {createAgentMutation.isPending ? "Creating…" : "Create Agent"}
            </Button>
          </div>
        </div>
      }
    >
      {/* Icon + heading */}
      <div className="flex flex-col items-center text-center mb-7">
        <div className="flex size-12 items-center justify-center rounded-sm border border-border bg-(--hover-bg) mb-4">
          <KeyRound className="size-5 text-(--text-main)" />
        </div>
        <h3 className="text-lg font-semibold text-(--text-main) tracking-tight">
          New Signer Agent
        </h3>
        <p className="mt-1.5 text-xs text-(--text-muted) leading-5 max-w-[260px]">
          Keypair generated and encrypted at rest by the backend. The public key
          becomes the{" "}
          <code className="mono text-[11px] text-(--text-main)">
            ai_authority
          </code>{" "}
          on new treasuries.
        </p>
      </div>

      <form
        id="create-agent-form"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {/* Agent ID */}
        <div className="space-y-1.5">
          {/* Label row with generate button */}
          <div className="flex items-center justify-between">
            <label
              htmlFor="new-agent-id"
              className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold"
            >
              Agent ID
            </label>
            <button
              type="button"
              onClick={applyGenerated}
              disabled={createAgentMutation.isPending}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-(--hover-bg) px-2 py-0.5 mono text-[9px] uppercase tracking-widest text-(--text-muted) transition-colors hover:border-primary hover:text-(--text-main) disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shuffle className="h-2.5 w-2.5" />
              Generate
            </button>
          </div>

          <input
            id="new-agent-id"
            value={agentId}
            onChange={handleAgentIdChange}
            onBlur={handleAgentIdBlur}
            placeholder="aura-sentinel-7f3a"
            autoComplete="off"
            disabled={createAgentMutation.isPending}
            required
            className={cn(
              "w-full bg-(--input-bg) border rounded-sm px-4 py-3 text-sm outline-none transition-colors text-(--text-main) placeholder:text-(--text-muted)/40",
              "focus:border-(--text-muted) disabled:opacity-50 disabled:cursor-not-allowed",
              validationError
                ? "border-danger focus:border-danger"
                : "border-border",
            )}
          />
          {validationError ? (
            <p className="mono text-[10px] text-danger">{validationError}</p>
          ) : (
            <p className="mono text-[10px] text-(--text-muted)">
              any characters, up to 64 bytes
            </p>
          )}
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <label
            htmlFor="new-agent-label"
            className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold"
          >
            Label{" "}
            <span className="normal-case tracking-normal font-normal opacity-50">
              (optional)
            </span>
          </label>
          <input
            id="new-agent-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Aura Sentinel"
            autoComplete="off"
            disabled={createAgentMutation.isPending}
            className="w-full bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none transition-colors text-(--text-main) placeholder:text-(--text-muted)/40 focus:border-(--text-muted) disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </form>
    </Modal>
  );
}
