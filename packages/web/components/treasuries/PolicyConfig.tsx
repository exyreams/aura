"use client";

import type { PublicKey } from "@solana/web3.js";
import { Ban, Shield, ShieldCheck } from "lucide-react";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Tabs } from "@/components/global/Tabs";
import { CHAINS } from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

interface PolicyConfigProps {
  treasury: TreasuryEntry;
}

export const PolicyConfig = ({ treasury }: PolicyConfigProps) => {
  const policy = treasury.account.policyConfig;
  const multisig = treasury.account.multisig;
  const swarm = treasury.account.swarm;
  const dwallets = treasury.account.dwallets;

  const PolicyContent = () => (
    <div className="space-y-2">
      {[
        {
          label: "DAILY LIMIT",
          value: formatCurrency(Number(policy.dailyLimitUsd.toString())),
          variant: "default" as const,
        },
        {
          label: "PER-TX LIMIT",
          value: formatCurrency(Number(policy.perTxLimitUsd.toString())),
          variant: "default" as const,
        },
        {
          label: "DAYTIME HOURLY",
          value: formatCurrency(
            Number(policy.daytimeHourlyLimitUsd.toString()),
          ),
          variant: "default" as const,
        },
        {
          label: "NIGHTTIME HOURLY",
          value: formatCurrency(
            Number(policy.nighttimeHourlyLimitUsd.toString()),
          ),
          variant: "default" as const,
        },
        {
          label: "VELOCITY LIMIT",
          value: formatCurrency(Number(policy.velocityLimitUsd.toString())),
          variant: "default" as const,
        },
        {
          label: "MAX SLIPPAGE",
          value: `${policy.maxSlippageBps} bps`,
          variant: "default" as const,
        },
        {
          label: "MAX QUOTE AGE",
          value: policy.maxQuoteAgeSecs ? `${policy.maxQuoteAgeSecs}s` : "N/A",
          variant: "default" as const,
        },
        {
          label: "MAX RISK SCORE",
          value: `${policy.maxCounterpartyRiskScore}/10`,
          variant: "default" as const,
        },
        {
          label: "SHARED POOL",
          value: swarm
            ? formatCurrency(Number(swarm.sharedPoolLimitUsd.toString()))
            : "N/A",
          variant: "default" as const,
        },
      ].map((item) => (
        <div
          key={item.label}
          className="flex justify-between items-center py-2 border-b border-border last:border-b-0"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-(--text-muted)">
            {item.label}
          </span>
          <Badge variant={item.variant}>{item.value}</Badge>
        </div>
      ))}
    </div>
  );

  const GovernanceContent = () => {
    const hasMultisig = multisig && multisig.guardians.length > 0;
    const hasSwarm = swarm && swarm.memberAgents.length > 0;

    return (
      <div>
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="p-4 bg-(--card-content) border border-border rounded-sm">
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
              Emergency Multisig
            </span>
            {hasMultisig ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-(--success-text)" />
                  <span className="text-sm font-semibold text-(--text-main)">
                    {multisig.requiredSignatures}-of-{multisig.guardians.length}{" "}
                    Active
                  </span>
                </div>
                <div className="space-y-2">
                  {multisig.guardians.map(
                    (guardian: PublicKey, idx: number) => (
                      <div
                        key={guardian.toBase58()}
                        className="text-[11px] text-(--text-muted)"
                      >
                        <span className="font-mono">Guardian {idx + 1}:</span>{" "}
                        {shortenAddress(guardian.toBase58(), 4, 4)}
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Ban size={16} className="text-(--text-muted)" />
                <span className="text-sm text-(--text-muted)">
                  Not Configured
                </span>
              </div>
            )}
          </div>
          <div className="p-4 bg-(--card-content) border border-border rounded-sm">
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
              Agent Swarm
            </span>
            {hasSwarm ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-(--success-text)" />
                  <span className="text-sm font-semibold text-(--text-main)">
                    {swarm.memberAgents.length} Members
                  </span>
                </div>
                <p className="text-[11px] text-(--text-muted)">
                  Shared pool limit:{" "}
                  {formatCurrency(Number(swarm.sharedPoolLimitUsd.toString()))}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Ban size={16} className="text-(--text-muted)" />
                  <span className="text-sm text-(--text-muted)">
                    Not Configured
                  </span>
                </div>
                <p className="text-[11px] text-(--text-muted)">
                  Enable swarm mode to allow multiple agents to share this
                  treasury's spending pool.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="p-4 bg-(--info-bg) border border-(--info-border) rounded-sm">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-(--info-text) mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-(--text-main) mb-1">
                Governance Override
              </h4>
              <p className="text-[11px] text-(--text-muted)">
                Emergency multisig can override policy decisions and cancel
                pending proposals in break-glass scenarios.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DWalletsContent = () => {
    const registeredDwallets = dwallets.filter((dw) => dw.dwalletId.length > 0);

    if (registeredDwallets.length === 0) {
      return (
        <div className="p-8 text-center border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">
            No dWallets registered yet
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {registeredDwallets.map((dw) => {
          const chain = CHAINS.find((c) => c.code === dw.chain);
          const chainName = chain?.label || "Unknown";

          return (
            <div
              key={dw.dwalletId}
              className="flex items-center justify-between p-4 bg-(--card-content) border border-border rounded-sm hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-sm bg-(--card-bg) flex items-center justify-center border border-border p-1.5">
                  <span className="text-xs font-bold">{chainName[0]}</span>
                </div>
                <div>
                  <div className="font-semibold text-sm text-(--text-main)">
                    {chainName}
                  </div>
                  <div className="font-mono text-[10px] text-(--text-muted)">
                    {dw.dwalletId}
                  </div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="font-mono text-xs text-(--text-main) mb-1">
                  {formatCurrency(Number(dw.balanceUsd.toString()))}
                </div>
                <StatusPill variant="active">Active</StatusPill>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const tabs = [
    {
      id: "policy",
      label: "Policy",
      content: <PolicyContent />,
    },
    {
      id: "governance",
      label: "Governance",
      content: <GovernanceContent />,
    },
    {
      id: "dwallets",
      label: "dWallets",
      content: <DWalletsContent />,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">Config</h2>
        <p className="text-[12px] text-(--text-muted)">
          Policy limits, governance settings, and registered dWallets.
        </p>
      </div>
      <Tabs tabs={tabs} defaultTab="policy" layoutId="configTabs" />
    </div>
  );
};
