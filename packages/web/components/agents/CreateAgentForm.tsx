"use client";

import { type FormEvent, useState } from "react";
import { Alert, Button, Input } from "@/components/global";
import { useAgents } from "@/lib/hooks";

export function CreateAgentForm() {
  const { createAgentMutation } = useAgents();
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedAgentId = agentId.trim();
    if (!normalizedAgentId) {
      setValidationError("Agent ID is required.");
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(normalizedAgentId)) {
      setValidationError(
        "Use 1-64 characters: letters, numbers, dashes, or underscores.",
      );
      return;
    }

    setValidationError(null);
    await createAgentMutation.mutateAsync({
      agentId: normalizedAgentId,
      label: label.trim() || undefined,
    });
    setAgentId("");
    setLabel("");
  };

  const error =
    validationError ??
    (createAgentMutation.error instanceof Error
      ? createAgentMutation.error.message
      : null);

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Agent ID"
          value={agentId}
          onChange={(event) => {
            setAgentId(event.target.value);
            setValidationError(null);
          }}
          placeholder="sentinel-alpha"
          autoComplete="off"
          disabled={createAgentMutation.isPending}
          required
        />
        <Input
          label="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Sentinel Alpha"
          autoComplete="off"
          disabled={createAgentMutation.isPending}
        />
      </div>
      {error ? <Alert variant="error" message={error} /> : null}
      <Button
        type="submit"
        variant="primary"
        loading={createAgentMutation.isPending}
      >
        Create Agent
      </Button>
    </form>
  );
}
