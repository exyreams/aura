"use client";

import { Skeleton } from "@/components/global";
import {
  Shield,
  ShieldCheck,
  TriangleAlert,
  Users,
  Zap,
} from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface GovernanceStatsBarProps {
  account?: TreasuryEntry["account"];
  isLoading?: boolean;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accent?: "default" | "success" | "warning" | "danger";
}

function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "default",
}: StatCardProps) {
  const iconClass = {
    default: "text-(--text-muted)",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[accent];

  return (
    <div className="p-5 bg-(--card-bg) border border-(--border) rounded-sm">
      <div className="flex items-start justify-between mb-3">
        <span className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
          {label}
        </span>
        <span className={iconClass}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold text-(--text-main) tracking-tight leading-none mb-1.5">
        {value}
      </div>
      {sub && <div className="text-[10px] mono text-(--text-muted)">{sub}</div>}
    </div>
  );
}

export function GovernanceStatsBar({
  account,
  isLoading,
}: GovernanceStatsBarProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((k) => (
          <Skeleton key={k} className="h-[90px] rounded-sm" />
        ))}
      </div>
    );
  }

  const multisig = account?.multisig;
  const swarm = account?.swarm;
  const override = multisig?.pendingOverride;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Multisig"
        value={
          multisig
            ? `${multisig.requiredSignatures}-of-${multisig.guardians.length}`
            : "—"
        }
        sub={multisig ? "signature threshold" : "not configured"}
        icon={<ShieldCheck size={14} animateOnHover />}
        accent={multisig ? "success" : "default"}
      />
      <StatCard
        label="Guardians"
        value={multisig?.guardians.length ?? 0}
        sub={
          (multisig?.guardians.length ?? 0) === 1
            ? "wallet address"
            : "wallet addresses"
        }
        icon={<Users size={14} animateOnHover />}
        accent={(multisig?.guardians.length ?? 0) > 0 ? "success" : "default"}
      />
      <StatCard
        label="Swarm Members"
        value={swarm?.memberAgents.length ?? 0}
        sub={
          swarm
            ? `Pool: ${formatCurrency(Number(swarm.sharedPoolLimitUsd.toString()) / 100)}`
            : "not configured"
        }
        icon={<Zap size={14} animateOnHover />}
        accent={(swarm?.memberAgents.length ?? 0) > 0 ? "success" : "default"}
      />
      <StatCard
        label="Active Override"
        value={
          override
            ? `${override.signaturesCollected.length}/${multisig?.requiredSignatures ?? "?"}`
            : "None"
        }
        sub={override ? "signatures collected" : "no pending proposal"}
        icon={
          override ? (
            <TriangleAlert size={14} animateOnHover />
          ) : (
            <Shield size={14} animateOnHover />
          )
        }
        accent={override ? "warning" : "default"}
      />
    </div>
  );
}
