"use client";

import {
  AlertTriangle,
  Check,
  Download,
  MousePointerClick,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { StatusPill } from "@/components/global/Badge";
import { Tooltip } from "@/components/global/Tooltip";
import {
  ChevronDown,
  Copy,
  KeyRound,
  PenLine,
  Xcircle,
} from "@/components/icons";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import type { AgentKeypair } from "@/lib/hooks";
import { cn, shortenAddress } from "@/lib/utils";

export interface AgentTreasuryLink {
  treasuryPda: string;
  agentId: string;
}

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Tooltip content={copied ? "Copied" : label}>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!text}
        aria-label={label}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? (
          <Check className="size-3 text-success" />
        ) : (
          <Copy className="size-3" animateOnHover />
        )}
      </button>
    </Tooltip>
  );
}

function IconButton({
  label,
  onClick,
  loading,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent) => void;
  loading?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading || disabled}
        aria-label={label}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40",
          danger
            ? "border-border text-muted-foreground hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
            : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ScopeChip({ scope }: { scope: string }) {
  const label = getAgentScopeLabel(scope);
  const transferScope = scope === "wallet:transfer";

  return (
    <Tooltip content={label}>
      <span
        className={cn(
          "inline-flex cursor-default items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide",
          transferScope
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {scope}
      </span>
    </Tooltip>
  );
}

export function AgentRow({
  agent,
  selected,
  linkedTreasuries,
  solBalance,
  onSelect,
  onDownload,
  onDelete,
  onEditScopes,
  deleting,
}: {
  agent: AgentKeypair;
  selected: boolean;
  linkedTreasuries: AgentTreasuryLink[];
  solBalance: number | null;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onEditScopes: () => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLowBalance = solBalance !== null && solBalance < 0.005;
  const hasPublicKey = Boolean(agent.publicKey);
  const revoked = agent.status === "revoked";
  const isBoundOnChain =
    agent.onchainStatus === "treasury_linked" && linkedTreasuries.length > 0;
  const visibleScopes = agent.scopes.slice(0, 3);
  const hiddenScopeCount = Math.max(
    agent.scopes.length - visibleScopes.length,
    0,
  );

  return (
    <div
      className={cn(
        "rounded-sm border bg-surface transition-colors duration-150",
        selected ? "border-primary/40" : "border-border hover:border-border",
        revoked && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-sm border",
            selected
              ? "border-primary/30 bg-primary/10"
              : "border-border bg-background",
          )}
        >
          <KeyRound
            className={cn(
              "size-3.5",
              selected ? "text-primary" : "text-muted-foreground",
            )}
            animateOnHover
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {agent.label || agent.agentId}
            </span>
            {selected ? <StatusPill variant="active">Active</StatusPill> : null}
            {hasPublicKey ? (
              <StatusPill variant="backend">Authority</StatusPill>
            ) : null}
            {revoked ? <StatusPill variant="error">Revoked</StatusPill> : null}
          </div>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {agent.agentId}
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {visibleScopes.map((scope) => (
              <ScopeChip key={scope} scope={scope} />
            ))}
            {hiddenScopeCount > 0 ? (
              <Tooltip content={`${hiddenScopeCount} more scopes`}>
                <span className="inline-flex cursor-default items-center rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                  +{hiddenScopeCount}
                </span>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <span className="font-mono text-[10px] text-muted-foreground">
            {hasPublicKey ? shortenAddress(agent.publicKey, 6, 4) : "no key"}
          </span>
          <CopyButton text={agent.publicKey} label="Copy public key" />
        </div>

        <div className="shrink-0">
          {hasPublicKey && solBalance !== null ? (
            <Tooltip
              content={
                isLowBalance
                  ? `Low: ${solBalance.toFixed(4)} SOL. Fund with ~0.01 SOL for FHE fees.`
                  : `${solBalance.toFixed(4)} SOL. Sufficient for FHE fees.`
              }
            >
              <span
                className={cn(
                  "inline-flex cursor-default items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                  isLowBalance
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-success/30 bg-success/10 text-success",
                )}
              >
                {isLowBalance ? (
                  <AlertTriangle className="size-2.5 shrink-0" />
                ) : null}
                {solBalance.toFixed(3)} SOL
              </span>
            </Tooltip>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">
              -
            </span>
          )}
        </div>

        <Tooltip
          content={
            isBoundOnChain
              ? `${linkedTreasuries.length} on-chain treasury ${
                  linkedTreasuries.length === 1 ? "link" : "links"
                }`
              : "No wallet-signed treasury link yet"
          }
        >
          <span
            className={cn(
              "hidden shrink-0 cursor-default items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest sm:inline-flex",
              isBoundOnChain
                ? "border-success/30 bg-success/10 text-success"
                : "border-border text-muted-foreground",
            )}
          >
            {isBoundOnChain ? `${linkedTreasuries.length} bound` : "not bound"}
          </span>
        </Tooltip>

        <span
          className="hidden shrink-0 font-mono text-[10px] text-muted-foreground lg:block"
          suppressHydrationWarning
        >
          {new Date(agent.createdAt * 1000).toLocaleDateString()}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {!selected && !revoked ? (
            <Tooltip content="Set as active signer">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect();
                }}
                className="inline-flex size-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Set as active signer"
              >
                <MousePointerClick className="size-3.5" />
              </button>
            </Tooltip>
          ) : null}
          <IconButton
            label={revoked ? "Revoked agents cannot be edited" : "Edit scopes"}
            onClick={(event) => {
              event.stopPropagation();
              onEditScopes();
            }}
            disabled={revoked}
          >
            <PenLine className="size-3.5" animateOnHover />
          </IconButton>
          <IconButton
            label="Export identity"
            disabled={!hasPublicKey}
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
          >
            <Download className="size-3.5" />
          </IconButton>
          <IconButton
            label={revoked ? "Already revoked" : "Revoke agent"}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            loading={deleting}
            disabled={revoked}
            danger
          >
            <Xcircle className="size-3.5" animateOnHover />
          </IconButton>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Show details"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200",
                expanded && "rotate-180",
              )}
              animateOnHover
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border px-4 pt-3 pb-3">
              <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2">
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  pubkey
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
                  {hasPublicKey
                    ? agent.publicKey
                    : "Authority key not recorded"}
                </span>
                <CopyButton text={agent.publicKey} label="Copy public key" />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {linkedTreasuries.length > 0 ? (
                  linkedTreasuries.map((treasury) => (
                    <div
                      key={treasury.treasuryPda}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-2 py-0.5"
                    >
                      <span className="font-mono text-[10px]">
                        {treasury.agentId}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {shortenAddress(treasury.treasuryPda, 4, 4)}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    no wallet-signed treasury link
                  </span>
                )}
              </div>

              <div className="grid gap-2 rounded-sm border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    scopes
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditScopes();
                    }}
                    disabled={revoked}
                    className="inline-flex min-h-8 items-center justify-center rounded-sm border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Edit scopes
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agent.scopes.length > 0 ? (
                    agent.scopes.map((scope) => (
                      <ScopeChip key={scope} scope={scope} />
                    ))
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      no scopes recorded
                    </span>
                  )}
                </div>
              </div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
