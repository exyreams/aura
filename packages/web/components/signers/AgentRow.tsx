"use client";

import {
  AlertTriangle,
  Check,
  Download,
  MousePointerClick,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { StatusPill, Tooltip } from "@/components/global";
import { ChevronDown, Copy, KeyRound, Xcircle } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/aura-app";
import type { AgentKeypair } from "@/lib/hooks";
import { cn, shortenAddress } from "@/lib/utils";

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Tooltip content={copied ? "Copied!" : label}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-(--text-muted) transition-colors hover:text-(--text-main)"
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
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-label={label}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          danger
            ? "border-border text-(--text-muted) hover:border-danger/50 hover:bg-(--danger-bg) hover:text-danger"
            : "border-border text-(--text-muted) hover:border-primary/50 hover:bg-(--hover-bg) hover:text-(--text-main)",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export interface AgentRowProps {
  agent: AgentKeypair;
  selected: boolean;
  linkedTreasuries: TreasuryEntry[];
  solBalance: number | null;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export function AgentRow({
  agent,
  selected,
  linkedTreasuries,
  solBalance,
  onSelect,
  onDownload,
  onDelete,
  deleting,
}: AgentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isLowBalance = solBalance !== null && solBalance < 0.005;

  return (
    <div
      className={cn(
        "rounded-sm border transition-all duration-150 bg-(--card-bg)",
        selected ? "border-primary/40" : "border-border hover:border-border",
      )}
    >
      {/* Main row — always visible, all key info */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Key icon */}
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-sm border",
            selected
              ? "border-primary/30 bg-primary/10"
              : "border-border bg-(--hover-bg)",
          )}
        >
          <KeyRound
            className={cn(
              "size-3.5",
              selected ? "text-primary" : "text-(--text-muted)",
            )}
            animateOnHover
          />
        </div>

        {/* Name + ID */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-(--text-main) truncate">
              {agent.label || agent.agentId}
            </span>
            {selected && <StatusPill variant="active">Active</StatusPill>}
          </div>
          <span className="font-mono text-[10px] text-(--text-muted) truncate block">
            {agent.agentId}
          </span>
        </div>

        {/* Pubkey — shortened, always visible on md+ */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] text-(--text-muted)">
            {shortenAddress(agent.publicKey, 6, 4)}
          </span>
          <CopyButton text={agent.publicKey} label="Copy public key" />
        </div>

        {/* Balance */}
        <div className="shrink-0">
          {solBalance !== null ? (
            <Tooltip
              content={
                isLowBalance
                  ? `Low: ${solBalance.toFixed(4)} SOL — fund with ~0.01 SOL for FHE fees`
                  : `${solBalance.toFixed(4)} SOL — sufficient for FHE fees`
              }
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border font-mono text-[9px] uppercase tracking-widest cursor-default",
                  isLowBalance
                    ? "bg-(--warning-bg) border-(--warning-border) text-(--warning-text)"
                    : "bg-(--success-bg) border-(--success-border) text-(--success-text)",
                )}
              >
                {isLowBalance && (
                  <AlertTriangle className="size-2.5 shrink-0" />
                )}
                {solBalance.toFixed(3)} SOL
              </span>
            </Tooltip>
          ) : (
            <span className="font-mono text-[10px] text-(--text-muted)">—</span>
          )}
        </div>

        {/* Linked treasuries count */}
        <Tooltip
          content={`${linkedTreasuries.length} linked ${linkedTreasuries.length === 1 ? "treasury" : "treasuries"}`}
        >
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-(--text-muted) shrink-0 cursor-default">
            <span className="text-(--text-main) font-semibold">
              {linkedTreasuries.length}
            </span>{" "}
            treasur{linkedTreasuries.length === 1 ? "y" : "ies"}
          </span>
        </Tooltip>

        {/* Created date */}
        <span
          className="hidden lg:block font-mono text-[10px] text-(--text-muted) shrink-0"
          suppressHydrationWarning
        >
          {new Date(agent.createdAt * 1000).toLocaleDateString()}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!selected && (
            <Tooltip content="Set as active signer">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:border-primary/50 hover:bg-(--hover-bg) hover:text-(--text-main)"
                aria-label="Set as active signer"
              >
                <MousePointerClick className="size-3.5" />
              </button>
            </Tooltip>
          )}
          <IconButton
            label="Export keypair"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="size-3.5" />
          </IconButton>
          <IconButton
            label="Delete agent"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            loading={deleting}
            danger
          >
            <Xcircle className="size-3.5" animateOnHover />
          </IconButton>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main)"
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

      {/* Expandable: full pubkey + linked treasury chips */}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0 space-y-2 border-t border-border">
              {/* Full pubkey */}
              <div className="flex items-center gap-2 rounded-sm border border-border bg-(--card-content) px-3 py-2 mt-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) shrink-0">
                  pubkey
                </span>
                <span className="flex-1 font-mono text-[10px] text-(--text-main) truncate min-w-0">
                  {agent.publicKey}
                </span>
                <CopyButton text={agent.publicKey} label="Copy public key" />
              </div>

              {/* Linked treasury chips */}
              {linkedTreasuries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {linkedTreasuries.map((t) => (
                    <div
                      key={t.publicKey.toBase58()}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-(--hover-bg) px-2 py-0.5"
                    >
                      <span className="font-mono text-[10px] text-(--text-main)">
                        {t.account.agentId}
                      </span>
                      <span className="font-mono text-[9px] text-(--text-muted)">
                        {shortenAddress(t.publicKey.toBase58(), 4, 4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
