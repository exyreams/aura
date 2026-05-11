"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import {
  Copy,
  EllipsisVertical,
  ExternalLink,
  Pause,
  Plus,
  Send,
  Shield,
  Users,
  Xcircle,
} from "@/components/icons";
import { ProposeTransactionModal } from "@/components/propose/ProposeTransactionModal";
import {
  getActivePendingProposal,
  sendWalletInstructions,
} from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";
import { cn, shortenAddress } from "@/lib/utils";
import { RegisterDWalletForm } from "./RegisterDWalletForm";

interface ActionOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface TreasuryHeaderProps {
  treasury: TreasuryEntry;
  pda: string;
}

export const TreasuryHeader = ({ treasury, pda }: TreasuryHeaderProps) => {
  const { push } = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const queryClient = useQueryClient();
  const activePending = getActivePendingProposal(treasury.account);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copiedPda, setCopiedPda] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCopyPda = async () => {
    await navigator.clipboard.writeText(pda);
    setCopiedPda(true);
    setTimeout(() => setCopiedPda(false), 2000);
  };

  const handleOpenExplorer = useCallback(() => {
    window.open(
      `https://explorer.solana.com/address/${pda}?cluster=${settings.network}`,
      "_blank",
    );
  }, [pda, settings.network]);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet first.");
      }
      const instruction = await client.pauseExecutionInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        !treasury.account.executionPaused,
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
      ]);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet first.");
      }
      const instruction = await client.cancelPendingInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
      ]);
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const actionOptions: ActionOption[] = useMemo(
    () => [
      {
        label: "Propose Transaction",
        icon: <Send className="size-4" animateOnHover />,
        onClick: () => setIsProposeOpen(true),
      },
      {
        label: "Guardrails",
        icon: <Shield className="size-4" animateOnHover />,
        onClick: () => push(`/dashboard/treasuries/${pda}/guardrails`),
      },
      {
        label: "Governance",
        icon: <Users size={16} animateOnHover />,
        onClick: () => push(`/dashboard/treasuries/${pda}/governance`),
      },
      {
        label: "Cancel Pending",
        icon: <Xcircle className="size-4" animateOnHover />,
        onClick: () => cancelMutation.mutate(),
        disabled: !activePending || cancelMutation.isPending,
      },
    ],
    [activePending, cancelMutation, pda, push],
  );

  const handleActionClick = (action: ActionOption) => {
    if (!action.disabled) {
      action.onClick();
      setIsDropdownOpen(false);
    }
  };

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4 border-b border-border">
        <div>
          {/* Active signing agent banner */}
          {selectedAgent ? (
            <div className="inline-flex items-center gap-2 mb-3 rounded-sm border border-primary/30 bg-primary/5 px-2.5 py-1">
              <div className="size-1.5 rounded-full bg-primary" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Signing agent
              </span>
              <span className="font-mono text-[10px] text-(--text-main) font-semibold">
                {selectedAgent.label || selectedAgent.agentId}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 mb-3 rounded-sm border border-warning/30 bg-warning/5 px-2.5 py-1">
              <div className="size-1.5 rounded-full bg-warning" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-(--warning-text)">
                No agent selected
              </span>
            </div>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Treasury Detail
          </span>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-semibold tracking-tight text-(--text-main)">
              {treasury.account.agentId}
            </h1>
            <StatusPill
              variant={treasury.account.executionPaused ? "paused" : "active"}
            >
              {treasury.account.executionPaused ? "Paused" : "Active"}
            </StatusPill>
          </div>
          {/* Shortened PDA with copy + explorer */}
          <div className="flex items-center gap-2 mt-1 flex-wrap break-all sm:break-normal">
            <span className="font-mono text-xs text-(--text-muted)">
              {shortenAddress(pda, 8, 6)}
            </span>
            <button
              type="button"
              onClick={handleCopyPda}
              title="Copy PDA"
              className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              <Copy className="size-3" animateOnHover />
            </button>
            <button
              type="button"
              onClick={handleOpenExplorer}
              title="View on Solana Explorer"
              className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              <ExternalLink className="size-3" animateOnHover />
            </button>
            {copiedPda && (
              <span className="text-[10px] text-(--success-text) font-mono">
                copied
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            icon={<Pause size={14} animateOnHover />}
            loading={pauseMutation.isPending}
            onClick={() => pauseMutation.mutate()}
          >
            {treasury.account.executionPaused ? "Resume" : "Pause"} Treasury
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="size-3.5" animateOnHover />}
            onClick={() => setIsModalOpen(true)}
          >
            Register dWallet
          </Button>

          <div ref={dropdownRef} className="relative">
            <Button
              variant="ghost"
              icon={<EllipsisVertical size={16} animateOnHover />}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="px-3"
            >
              More
            </Button>

            <AnimatePresence>
              {isDropdownOpen && (
                <m.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-2 w-64 bg-(--bg) border border-border rounded-sm shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-1.5 space-y-0.5">
                    {actionOptions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => handleActionClick(action)}
                        disabled={action.disabled}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-sm flex items-center gap-2.5 transition-colors",
                          action.disabled
                            ? "text-(--text-muted) opacity-50 cursor-not-allowed"
                            : "text-(--text-main) hover:bg-(--hover-bg) cursor-pointer",
                        )}
                      >
                        <span className="shrink-0">{action.icon}</span>
                        <span className="flex-1">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <RegisterDWalletForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        treasury={treasury}
      />

      <ProposeTransactionModal
        isOpen={isProposeOpen}
        onClose={() => setIsProposeOpen(false)}
        pda={pda}
      />
    </>
  );
};
