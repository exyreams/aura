"use client";

import {
  MoreVertical,
  Pause,
  Plus,
  Send,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import type { TreasuryEntry } from "@/lib/hooks";
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
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const actionOptions: ActionOption[] = [
    {
      label: "Propose Transaction",
      icon: <Send size={16} />,
      onClick: () => router.push(`/dashboard/treasuries/${pda}/propose`),
    },
    {
      label: "Configure Confidential Guardrails",
      icon: <Shield size={16} />,
      onClick: () => console.log("Configure Guardrails"),
    },
    {
      label: "Configure Governance",
      icon: <Users size={16} />,
      onClick: () => console.log("Configure Governance"),
    },
    {
      label: "Cancel Pending",
      icon: <XCircle size={16} />,
      onClick: () => console.log("Cancel Pending"),
      disabled: true,
    },
  ];

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
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Treasury Detail
          </span>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-bold tracking-tight text-(--text-main)">
              {treasury.account.agentId}
            </h1>
            <StatusPill
              variant={treasury.account.executionPaused ? "paused" : "active"}
            >
              {treasury.account.executionPaused ? "Paused" : "Active"}
            </StatusPill>
          </div>
          <p className="text-(--text-muted) font-light text-sm">
            Live state for{" "}
            <span className="font-mono text-(--text-main) opacity-80">
              {shortenAddress(pda, 4, 4)}
            </span>{" "}
            on <span className="text-(--text-main)">Devnet</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<Pause size={14} />}>
            {treasury.account.executionPaused ? "Resume" : "Pause"} Treasury
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setIsModalOpen(true)}
          >
            Register dWallet
          </Button>

          <div ref={dropdownRef} className="relative">
            <Button
              variant="ghost"
              icon={<MoreVertical size={16} />}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="px-3"
            />

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-2 w-64 bg-(--bg) border border-border rounded-sm shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-2 space-y-1">
                    {actionOptions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => handleActionClick(action)}
                        disabled={action.disabled}
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm rounded-sm flex items-center gap-3 transition-colors",
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <RegisterDWalletForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};
