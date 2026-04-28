"use client";

import { StatusPill } from "@/components/global/Badge";
import { Tabs } from "@/components/global/Tabs";

const PendingContent = () => (
  <div className="p-6 rounded-sm border border-(--warning-border) bg-(--warning-bg)">
    <div className="flex justify-between items-start mb-6">
      <div>
        <div className="font-mono text-[10px] text-(--warning-text) mb-1">
          PROP-2024-0891
        </div>
        <h3 className="font-bold text-(--text-main)">$450.00 Swap Proposal</h3>
      </div>
      <StatusPill variant="medium">Pending Approval</StatusPill>
    </div>

    <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
          Chain
        </span>
        <span className="font-mono text-sm text-(--text-main)">Solana</span>
      </div>
      <div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
          Type
        </span>
        <span className="font-mono text-sm text-(--text-main)">Swap</span>
      </div>
      <div className="col-span-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
          Recipient
        </span>
        <span className="font-mono text-sm text-(--text-main) truncate block">
          8xK2R9m5jP...mN9p
        </span>
      </div>
    </div>

    <div className="pt-4 border-t border-(--warning-border) flex justify-between items-center">
      <span className="font-mono text-[10px] text-(--warning-text) opacity-80">
        Awaiting multisig...
      </span>
      <button
        type="button"
        className="text-[10px] font-mono uppercase text-(--text-main) hover:underline transition-all"
      >
        View Details
      </button>
    </div>
  </div>
);

const AuditContent = () => (
  <div className="space-y-3">
    {[
      {
        type: "POLICY_AUDIT",
        time: "2h ago",
        desc: "Max slippage updated to 50 bps",
        severity: "info",
      },
      {
        type: "SPEND_PROPOSAL",
        time: "5h ago",
        desc: "Swap approved: 10.5 SOL → USDC",
        severity: "success",
      },
      {
        type: "LIMIT_UPDATE",
        time: "1d ago",
        desc: "Daily limit increased to $5k",
        severity: "warning",
      },
      {
        type: "DWALLET_REGISTER",
        time: "2d ago",
        desc: "Ethereum dWallet added",
        severity: "info",
      },
      {
        type: "GOVERNANCE_CHANGE",
        time: "7d ago",
        desc: "Multisig threshold changed to 2-of-3",
        severity: "warning",
      },
      {
        type: "POLICY_VIOLATION",
        time: "10d ago",
        desc: "Transaction rejected: Daily limit exceeded",
        severity: "error",
      },
      {
        type: "AGENT_INIT",
        time: "14d ago",
        desc: "Treasury initialized",
        severity: "success",
      },
    ].map((event) => {
      const severityColors = {
        info: "bg-blue-500/20 border-blue-500/30",
        success: "bg-green-500/20 border-green-500/30",
        warning: "bg-yellow-500/20 border-yellow-500/30",
        error: "bg-red-500/20 border-red-500/30",
      };

      return (
        <div
          key={`${event.type}-${event.time}`}
          className="flex gap-4 items-start p-3 rounded-sm border border-border hover:bg-(--hover-bg) transition-colors"
        >
          <div
            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 border ${severityColors[event.severity as keyof typeof severityColors]}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2 mb-1">
              <span className="font-mono text-[11px] text-(--text-main) font-semibold">
                {event.type}
              </span>
              <span className="font-mono text-[10px] text-(--text-muted) shrink-0">
                {event.time}
              </span>
            </div>
            <p className="text-[11px] text-(--text-muted)">{event.desc}</p>
          </div>
        </div>
      );
    })}
  </div>
);

export const TreasuryActivity = () => {
  const tabs = [
    {
      id: "pending",
      label: "Pending",
      content: <PendingContent />,
    },
    {
      id: "audit",
      label: "Audit Trail",
      content: <AuditContent />,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Treasury Activity
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Monitor pending proposals and audit events.
        </p>
      </div>
      <Tabs tabs={tabs} defaultTab="pending" />
    </div>
  );
};
