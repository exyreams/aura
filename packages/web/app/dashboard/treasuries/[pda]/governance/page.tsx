"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  GovernanceHeader,
  GovernanceHistory,
  GovernanceStatsBar,
  MultisigConfig,
  ProposeOverride,
  SwarmConfig,
} from "@/components/governance";
import type { MultisigFormArgs } from "@/components/governance/MultisigConfig";
import type { SwarmFormArgs } from "@/components/governance/SwarmConfig";
import {
  buildConfigureMultisigArgs,
  buildConfigureSwarmArgs,
  type ParsedActivity,
  sendWalletInstructions,
} from "@/lib/aura-app";
import {
  type ActivityEvent,
  useActivity,
  useAuraClient,
  useTreasury,
} from "@/lib/hooks";

function mapBackendEvents(events: ActivityEvent[]): ParsedActivity[] {
  return events.map((ev) => ({
    signature: ev.txSignature,
    txSignature: ev.txSignature,
    treasury: ev.treasuryAddress,
    proposalId: ev.proposalId ?? undefined,
    kind: (ev.kind === "proposal_submitted" ||
    ev.kind === "confidential_proposal_submitted"
      ? "proposal"
      : ev.kind === "execution_finalized"
        ? "execution"
        : "audit") as ParsedActivity["kind"],
    status: ev.status ?? undefined,
    approved: ev.approved ?? undefined,
    violation: ev.violation ?? undefined,
    detail: ev.kind,
    timestamp: ev.timestamp,
  }));
}

export default function GovernanceConfigurationPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const queryClient = useQueryClient();

  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const account = entry?.account;

  const activityQuery = useActivity({ treasury: pda, enabled: !!pda });
  const activity = mapBackendEvents(activityQuery.data?.events ?? []);

  const [overrideLimit, setOverrideLimit] = useState("0");

  const multisigMutation = useMutation({
    mutationFn: async ({ required, guardians }: MultisigFormArgs) => {
      if (!wallet.publicKey || !entry)
        throw new Error("Connect a wallet first.");
      const args = buildConfigureMultisigArgs({
        requiredSignatures: Number(required),
        guardians: guardians.flatMap((v) => {
          const t = v.trim();
          return t ? [new PublicKey(t)] : [];
        }),
      });
      const instruction = await client.configureMultisigInstruction(
        { owner: wallet.publicKey, treasury: entry.publicKey },
        args,
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const swarmMutation = useMutation({
    mutationFn: async ({ swarmId, members, poolLimit }: SwarmFormArgs) => {
      if (!wallet.publicKey || !entry)
        throw new Error("Connect a wallet first.");
      const args = buildConfigureSwarmArgs({
        swarmId,
        memberAgents: members.flatMap((v) => {
          const t = v.trim();
          return t ? [t] : [];
        }),
        sharedPoolLimitUsd: Number(poolLimit),
      });
      const instruction = await client.configureSwarmInstruction(
        { owner: wallet.publicKey, treasury: entry.publicKey },
        args,
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const overrideProposeMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry)
        throw new Error("Connect a wallet first.");
      const instruction = await client.proposeOverrideInstruction(
        { guardian: wallet.publicKey, treasury: entry.publicKey },
        Number(overrideLimit),
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const overrideCollectMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry)
        throw new Error("Connect a wallet first.");
      const instruction = await client.collectOverrideSignatureInstruction(
        { guardian: wallet.publicKey, treasury: entry.publicKey },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  return (
    <div className="relative min-h-screen">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 relative z-10 space-y-8">
        <GovernanceHeader treasury={entry} />

        <GovernanceStatsBar
          account={account}
          isLoading={treasuryQuery.isLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: config cards */}
          <div className="lg:col-span-8 space-y-6">
            <MultisigConfig
              account={account}
              multisigMutation={multisigMutation}
            />
            <SwarmConfig account={account} swarmMutation={swarmMutation} />
          </div>

          {/* Right: override sidebar */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-6">
              <ProposeOverride
                account={account}
                overrideLimit={overrideLimit}
                setOverrideLimit={setOverrideLimit}
                overrideProposeMutation={overrideProposeMutation}
                overrideCollectMutation={overrideCollectMutation}
              />
            </div>
          </div>
        </div>

        <GovernanceHistory
          activity={activity}
          isLoading={activityQuery.isLoading}
        />
      </main>
    </div>
  );
}
