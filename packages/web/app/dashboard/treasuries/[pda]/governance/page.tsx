"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  GovernanceHeader,
  GovernanceHistory,
  MultisigConfig,
  ProposeOverride,
  SwarmConfig,
} from "@/components/governance";
import {
  buildConfigureMultisigArgs,
  buildConfigureSwarmArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { useAuraClient, useRecentActivity, useTreasury } from "@/lib/hooks";

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
  const activityQuery = useRecentActivity(entry ? [entry] : []);
  const activity = activityQuery.data ?? [];

  const [multisigForm, setMultisigForm] = useState({
    required: account?.multisig?.requiredSignatures.toString() ?? "2",
    guardians:
      account?.multisig?.guardians
        .map((guardian: PublicKey) => guardian.toBase58())
        .join(", ") ?? "",
  });
  const [swarmForm, setSwarmForm] = useState({
    swarmId: account?.swarm?.swarmId ?? "",
    members: account?.swarm?.memberAgents.join(", ") ?? "",
    poolLimit: account?.swarm?.sharedPoolLimitUsd.toString() ?? "0",
  });
  const [overrideLimit, setOverrideLimit] = useState("0");

  const multisigMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const args = buildConfigureMultisigArgs({
        requiredSignatures: Number(multisigForm.required),
        guardians: multisigForm.guardians
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean)
          .map((value: string) => new PublicKey(value)),
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
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const args = buildConfigureSwarmArgs({
        swarmId: swarmForm.swarmId,
        memberAgents: swarmForm.members
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean),
        sharedPoolLimitUsd: Number(swarmForm.poolLimit),
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
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
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
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
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
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--grid) 1px, transparent 1px),
              linear-gradient(to bottom, var(--grid) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute top-[10%] right-[5%] w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(107, 114, 128, 0.04) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[20%] left-[5%] w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(107, 114, 128, 0.04) 0%, transparent 70%)",
          }}
        />
      </div>

      <main className="max-w-[1440px] mx-auto p-8 lg:p-12 relative z-10 space-y-8">
        <GovernanceHeader treasury={entry} />

        <MultisigConfig
          account={account}
          multisigForm={multisigForm}
          setMultisigForm={setMultisigForm}
          multisigMutation={multisigMutation}
        />

        <ProposeOverride
          account={account}
          overrideLimit={overrideLimit}
          setOverrideLimit={setOverrideLimit}
          overrideProposeMutation={overrideProposeMutation}
          overrideCollectMutation={overrideCollectMutation}
        />

        <SwarmConfig
          account={account}
          swarmForm={swarmForm}
          setSwarmForm={setSwarmForm}
          swarmMutation={swarmMutation}
        />

        <GovernanceHistory activity={activity} />
      </main>
    </div>
  );
}
