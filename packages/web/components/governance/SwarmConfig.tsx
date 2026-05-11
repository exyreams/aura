"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { MultiSelect } from "@/components/global/MultiSelect";
import { UsdInput } from "@/components/global/UsdInput";
import { Zap } from "@/components/icons";
import { type TreasuryEntry, useAgents } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

export interface SwarmFormArgs {
  swarmId: string;
  members: string[];
  poolLimit: string;
}

interface SwarmConfigProps {
  account?: TreasuryEntry["account"];
  swarmMutation: UseMutationResult<string, Error, SwarmFormArgs, unknown>;
}

export function SwarmConfig({ account, swarmMutation }: SwarmConfigProps) {
  const { agents } = useAgents();

  const [isOpen, setIsOpen] = useState(false);
  const [swarmId, setSwarmId] = useState("");
  const [poolLimit, setPoolLimit] = useState("0");
  const [members, setMembers] = useState<string[]>([]);

  const openModal = () => {
    setSwarmId(account?.swarm?.swarmId ?? "");
    setPoolLimit(account?.swarm?.sharedPoolLimitUsd.toString() ?? "0");
    setMembers(account?.swarm?.memberAgents ?? []);
    swarmMutation.reset();
    setIsOpen(true);
  };

  const handleSave = () => {
    swarmMutation.mutate({ swarmId, members, poolLimit });
  };

  useEffect(() => {
    if (swarmMutation.isSuccess) setIsOpen(false);
  }, [swarmMutation.isSuccess]);

  // Build MultiSelect options from fetched agents
  const agentOptions = agents.map((agent) => ({
    value: agent.agentId,
    label: agent.label || agent.agentId,
  }));

  const swarm = account?.swarm;

  return (
    <>
      <Card className="p-6" hover={false}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-sm bg-(--card-content)/60 border border-border shrink-0 mt-0.5">
              <Zap size={16} className="text-(--text-muted)" animateOnHover />
            </div>
            <div>
              <h2 className="text-base font-semibold text-(--text-main) mb-1">
                Agent Swarm
              </h2>
              <p className="text-xs text-(--text-muted)">
                Shared spending pool across multiple agent instances.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="small" onClick={openModal}>
            {swarm ? "Edit" : "Configure"}
          </Button>
        </div>

        {/* Read-only state display */}
        {swarm ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-(--card-content)/60 border border-border rounded-sm">
                <div className="mono text-[9px] uppercase text-(--text-muted) tracking-widest mb-1.5">
                  Swarm ID
                </div>
                <div className="mono text-xs text-(--text-main) font-semibold truncate">
                  {swarm.swarmId}
                </div>
              </div>
              <div className="p-3 bg-(--card-content)/60 border border-border rounded-sm">
                <div className="mono text-[9px] uppercase text-(--text-muted) tracking-widest mb-1.5">
                  Pool Limit
                </div>
                <div className="mono text-xs text-(--text-main) font-semibold">
                  {formatCurrency(
                    Number(swarm.sharedPoolLimitUsd.toString()) / 100,
                  )}
                </div>
              </div>
            </div>
            <div className="p-3 bg-(--card-content)/60 border border-border rounded-sm">
              <div className="mono text-[9px] uppercase text-(--text-muted) tracking-widest mb-2.5">
                Member agents ({swarm.memberAgents.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {swarm.memberAgents.map((agentId) => {
                  const known = agents.find((a) => a.agentId === agentId);
                  return (
                    <span
                      key={agentId}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-(--card-content)/60 border border-border rounded-sm mono text-[10px] text-(--text-main)"
                    >
                      <span className="size-1.5 rounded-full bg-success/60 shrink-0" />
                      {known?.label || agentId}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center border border-dashed border-border rounded-sm space-y-2">
            <Zap
              size={22}
              className="text-(--text-muted) mx-auto"
              animateOnHover
            />
            <p className="text-sm text-(--text-muted)">No swarm configured.</p>
            <p className="text-xs text-(--text-muted) opacity-60">
              Create a swarm to share spending limits across agents.
            </p>
          </div>
        )}
      </Card>

      {/* Edit modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Configure Agent Swarm"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleSave}
              loading={swarmMutation.isPending}
              disabled={!swarmId || !poolLimit || members.length === 0}
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="modal-swarm-id"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-2.5 tracking-widest"
              >
                Swarm ID
              </label>
              <Input
                id="modal-swarm-id"
                value={swarmId}
                onChange={(e) => setSwarmId(e.target.value)}
                placeholder="ALPHA-SWARM-01"
                className="mono"
              />
            </div>
            <UsdInput
              label="Shared pool limit"
              valueCents={poolLimit}
              onChangeCents={setPoolLimit}
              placeholder="100000.00"
            />
          </div>

          <div>
            <label
              htmlFor="member-agents"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-2.5 tracking-widest"
            >
              Member agents
            </label>
            <MultiSelect
              id="member-agents"
              options={agentOptions}
              value={members}
              onChange={setMembers}
              placeholder={
                agentOptions.length > 0
                  ? "Select agents or type a custom ID..."
                  : "Type an agent ID and press Enter..."
              }
            />
            {agentOptions.length > 0 && (
              <p className="mt-2 text-[10px] mono text-(--text-muted)">
                {agentOptions.length} agent
                {agentOptions.length !== 1 ? "s" : ""} available · press Enter
                to add custom IDs
              </p>
            )}
          </div>

          {swarmMutation.error && (
            <Alert variant="error" message={swarmMutation.error.message} />
          )}
        </div>
      </Modal>
    </>
  );
}
