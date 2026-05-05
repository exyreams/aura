"use client";

import { Check, Copy, Download, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, StatusPill } from "@/components/global";
import type { TreasuryEntry } from "@/lib/aura-app";
import type { AgentKeypair } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface AgentCardProps {
  agent: AgentKeypair;
  selected: boolean;
  linkedTreasuries: TreasuryEntry[];
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export function AgentCard({
  agent,
  selected,
  linkedTreasuries,
  onSelect,
  onDownload,
  onDelete,
  deleting,
}: AgentCardProps) {
  const [copied, setCopied] = useState(false);

  const copyPublicKey = async () => {
    await navigator.clipboard.writeText(agent.publicKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Card
      hover={false}
      className={`space-y-5 ${selected ? "border-primary" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-(--hover-bg)">
            <KeyRound className="h-5 w-5 text-(--text-main)" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-(--text-main)">
                {agent.label || agent.agentId}
              </h2>
              {selected ? (
                <StatusPill variant="active">Selected</StatusPill>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-(--text-muted)">
              {agent.agentId}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={selected ? "secondary" : "primary"}
            size="small"
            disabled={selected}
            onClick={onSelect}
          >
            {selected ? "Active" : "Select"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="small"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={onDownload}
          >
            Download
          </Button>
          <Button
            type="button"
            variant="danger"
            size="small"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            loading={deleting}
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-(--card-bg) p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
              Agent Public Key
            </p>
            <p className="mt-2 break-all font-mono text-sm text-(--text-main)">
              {agent.publicKey}
            </p>
          </div>
          <button
            type="button"
            onClick={copyPublicKey}
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Copy agent public key"
          >
            {copied ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Created
          </p>
          <p className="mt-1 text-(--text-main)">
            {new Date(agent.createdAt * 1000).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Linked Treasuries
          </p>
          <p className="mt-1 text-(--text-main)">{linkedTreasuries.length}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            ai_authority
          </p>
          <p className="mt-1 font-mono text-(--text-main)">
            {shortenAddress(agent.publicKey, 6, 6)}
          </p>
        </div>
      </div>

      {linkedTreasuries.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          {linkedTreasuries.map((treasury) => (
            <div
              key={treasury.publicKey.toBase58()}
              className="flex items-center justify-between gap-3 rounded-sm border border-border bg-(--hover-bg) px-3 py-2"
            >
              <span className="font-mono text-xs text-(--text-main)">
                {treasury.account.agentId}
              </span>
              <span className="font-mono text-[11px] text-(--text-muted)">
                {shortenAddress(treasury.publicKey.toBase58(), 6, 6)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
