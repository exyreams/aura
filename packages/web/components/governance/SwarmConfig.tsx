"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Input, StatusPill } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface SwarmConfigProps {
  account?: TreasuryEntry["account"];
  swarmForm: {
    swarmId: string;
    members: string;
    poolLimit: string;
  };
  setSwarmForm: Dispatch<
    SetStateAction<{
      swarmId: string;
      members: string;
      poolLimit: string;
    }>
  >;
  swarmMutation: UseMutationResult<string, Error, void, unknown>;
}

export function SwarmConfig({
  account,
  swarmForm,
  setSwarmForm,
  swarmMutation,
}: SwarmConfigProps) {
  return (
    <Card className="p-8 md:p-10" hover={false}>
      <div className="flex flex-col lg:flex-row justify-between gap-12">
        <div className="flex-1 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-(--text-main) mb-1">
              Agent Swarm Configuration
            </h2>
            <p className="text-sm text-(--text-muted)">
              Shared spending pool across multiple agents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label
                htmlFor="swarm-id"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
              >
                Swarm ID
              </label>
              <Input
                id="swarm-id"
                value={swarmForm.swarmId}
                onChange={(e) =>
                  setSwarmForm((current) => ({
                    ...current,
                    swarmId: e.target.value,
                  }))
                }
                placeholder="ALPHA-SWARM-01"
              />
            </div>
            <UsdInput
              label="Shared pool limit"
              valueCents={swarmForm.poolLimit}
              onChangeCents={(v) =>
                setSwarmForm((current) => ({ ...current, poolLimit: v }))
              }
              placeholder="100000.00"
            />
            <div className="md:col-span-2 space-y-4">
              <label
                htmlFor="member-agents"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
              >
                Member agent IDs (comma-separated)
              </label>
              <textarea
                id="member-agents"
                className="w-full px-4 py-3 bg-(--card-bg) border border-border rounded-sm text-(--text-main) text-sm mono focus:outline-none focus:border-(--text-main) transition-colors resize-none"
                rows={3}
                value={swarmForm.members}
                onChange={(e) =>
                  setSwarmForm((current) => ({
                    ...current,
                    members: e.target.value,
                  }))
                }
                placeholder="agent-1, agent-2, agent-3"
              />
            </div>
          </div>
        </div>

        <div className="lg:w-80 space-y-6 pt-2">
          <span className="mono text-[10px] uppercase text-(--text-muted) font-bold block">
            Current Swarm State
          </span>
          <div className="p-4 bg-white/5 border border-white/5 rounded space-y-5">
            {account?.swarm ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-(--text-muted)">Swarm ID</span>
                  <StatusPill variant="active" className="text-[9px]">
                    {account.swarm.swarmId}
                  </StatusPill>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-(--text-muted) uppercase mono">
                      Pool Limit
                    </span>
                    <span className="text-(--text-main) mono">
                      {formatCurrency(
                        Number(account.swarm.sharedPoolLimitUsd.toString()),
                      )}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] mono text-(--text-muted) uppercase">
                    Member Agents
                  </span>
                  <ul className="space-y-1">
                    {account.swarm.memberAgents.map((agent) => (
                      <li
                        key={agent}
                        className="text-[10px] text-(--text-main) opacity-80 flex items-center gap-2"
                      >
                        <div className="size-1 rounded-full bg-zinc-500" />{" "}
                        {agent}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="text-xs text-(--text-muted) italic">
                No swarm configured
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => swarmMutation.mutate()}
              loading={swarmMutation.isPending}
              disabled={!swarmForm.swarmId || !swarmForm.poolLimit}
            >
              Configure Swarm
            </Button>
            {swarmMutation.error && (
              <div className="text-xs text-danger">
                {swarmMutation.error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
