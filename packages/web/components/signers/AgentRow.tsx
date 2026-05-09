"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  MousePointerClick,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { StatusPill, Tooltip } from "@/components/global";
import type { TreasuryEntry } from "@/lib/aura-app";
import type { AgentKeypair } from "@/lib/hooks";
import { cn, shortenAddress } from "@/lib/utils";

// Copy button

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Tooltip content={copied ? "Copied!" : "Copy public key"}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy public key"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main)"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </Tooltip>
  );
}

// Icon action button

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
          "inline-flex h-8 w-8 items-center justify-center rounded-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
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

// AgentRow

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
  const [expanded, setExpanded] = useState(selected);
  const isLowBalance = solBalance !== null && solBalance < 0.005;

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div
      className={cn(
        "rounded-sm border transition-all duration-150",
        selected
          ? "border-border bg-(--card-bg)"
          : "border-border/60 bg-(--card-bg) hover:border-border",
      )}
    >
      {/* Clickable header row */}
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          {/* Chevron + key icon + name — this area toggles expand */}
          <button
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-(--text-muted) transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border",
                selected
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-(--hover-bg)",
              )}
            >
              <KeyRound
                className={cn(
                  "h-3.5 w-3.5",
                  selected ? "text-primary" : "text-(--text-muted)",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-(--text-main) truncate leading-tight">
                {agent.label || agent.agentId}
              </span>
              <span className="block mt-0.5 font-mono text-[10px] uppercase tracking-widest text-(--text-muted) truncate">
                {agent.agentId}
              </span>
            </div>
          </button>

          {/* Action buttons — outside the toggle button */}
          <div className="flex items-center gap-1 shrink-0">
            {!selected && (
              <Tooltip content="Set as active signer">
                <button
                  type="button"
                  onClick={(e) => handleActionClick(e, onSelect)}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-sm border border-border bg-(--hover-bg) text-(--text-muted) transition-colors hover:border-primary/50 hover:text-(--text-main)"
                  aria-label="Set as active signer"
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
            <IconButton
              label="Export keypair"
              onClick={(e) => handleActionClick(e, onDownload)}
            >
              <Download className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Delete agent"
              onClick={(e) => handleActionClick(e, onDelete)}
              loading={deleting}
              danger
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        {/* Status badges row (always visible) */}
        <div className="mt-2.5 ml-17 flex flex-wrap items-center gap-1.5">
          {selected && <StatusPill variant="active">Active</StatusPill>}
          {solBalance !== null && (
            <Tooltip
              content={
                isLowBalance
                  ? `Low balance: ${solBalance.toFixed(4)} SOL. Fund with ~0.01 SOL to cover FHE network fees for confidential transactions. Regular proposals don't require agent funds.`
                  : `Balance: ${solBalance.toFixed(4)} SOL — sufficient for FHE network fees.`
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
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                )}
                {solBalance.toFixed(3)} SOL
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Expandable details */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
              {/* Public key strip */}
              <div className="flex items-center gap-2 rounded-sm border border-border/60 bg-(--card-content) px-2.5 py-1.5 min-w-0">
                <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) shrink-0 select-none">
                  pubkey
                </span>
                <span className="flex-1 font-mono text-[10px] text-(--text-main) truncate min-w-0">
                  {agent.publicKey}
                </span>
                <CopyButton text={agent.publicKey} />
              </div>

              {/* Meta row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[9px] text-(--text-muted)">
                  Created{" "}
                  <span
                    className="text-(--text-main)"
                    suppressHydrationWarning
                  >
                    {new Date(agent.createdAt * 1000).toLocaleDateString()}
                  </span>
                </span>
                <span className="text-border/60 select-none">·</span>
                <span className="font-mono text-[9px] text-(--text-muted)">
                  Treasuries{" "}
                  <span className="text-(--text-main)">
                    {linkedTreasuries.length}
                  </span>
                </span>
                <span className="text-border/60 select-none">·</span>
                <span className="font-mono text-[9px] text-(--text-muted)">
                  ai_authority{" "}
                  <span className="text-(--text-main)">
                    {shortenAddress(agent.publicKey, 4, 4)}
                  </span>
                </span>
              </div>

              {/* Linked treasury chips */}
              {linkedTreasuries.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/40 pt-2.5">
                  {linkedTreasuries.map((t) => (
                    <div
                      key={t.publicKey.toBase58()}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-(--hover-bg) px-2 py-0.5"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
