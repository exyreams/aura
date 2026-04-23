"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/app/ui";
import {
  buildConfigureMultisigArgs,
  buildConfigureSwarmArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { useAuraClient, useTreasury } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

export default function GovernancePage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const account = entry?.account;

  const [multisigForm, setMultisigForm] = useState({
    required: account?.multisig?.requiredSignatures.toString() ?? "2",
    guardians:
      account?.multisig?.guardians
        .map((guardian) => guardian.toBase58())
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
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => new PublicKey(value)),
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
          .map((value) => value.trim())
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Governance"
        title="Emergency multisig and swarm config."
        copy={`All actions on this page submit real governance instructions for ${shortenAddress(pda, 8, 8)}.`}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface title="Emergency Multisig">
          <div className="space-y-5">
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Current config</p>
              <p className="mt-2">
                {account?.multisig
                  ? `${account.multisig.requiredSignatures}-of-${account.multisig.guardians.length}`
                  : "Not configured"}
              </p>
              <p className="mt-1">
                {account?.multisig
                  ? account.multisig.guardians
                      .map((guardian) => guardian.toBase58())
                      .join(", ")
                  : "No guardians"}
              </p>
            </div>

            <div className="grid gap-4">
              <label>
                <span className="field-label">Guardian list</span>
                <textarea
                  className="textarea"
                  value={multisigForm.guardians}
                  onChange={(event) =>
                    setMultisigForm((current) => ({
                      ...current,
                      guardians: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Threshold</span>
                <input
                  className="input"
                  value={multisigForm.required}
                  onChange={(event) =>
                    setMultisigForm((current) => ({
                      ...current,
                      required: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => multisigMutation.mutate()}
                >
                  Configure multisig
                </button>
                <input
                  className="input max-w-56"
                  value={overrideLimit}
                  onChange={(event) => setOverrideLimit(event.target.value)}
                  placeholder="Override daily limit"
                />
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => overrideProposeMutation.mutate()}
                >
                  Propose override
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => overrideCollectMutation.mutate()}
                >
                  Sign override
                </button>
              </div>
            </div>
          </div>
        </Surface>

        <Surface title="Agent Swarm">
          <div className="space-y-5">
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Current config</p>
              <p className="mt-2">
                {account?.swarm ? account.swarm.swarmId : "No swarm configured"}
              </p>
              {account?.swarm ? (
                <>
                  <p className="mt-1">
                    {account.swarm.memberAgents.join(", ")}
                  </p>
                  <p className="mt-1">
                    Shared pool{" "}
                    {formatCurrency(
                      Number(account.swarm.sharedPoolLimitUsd.toString()),
                    )}
                  </p>
                </>
              ) : null}
            </div>

            <div className="grid gap-4">
              <label>
                <span className="field-label">Swarm ID</span>
                <input
                  className="input"
                  value={swarmForm.swarmId}
                  onChange={(event) =>
                    setSwarmForm((current) => ({
                      ...current,
                      swarmId: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Member agent IDs</span>
                <textarea
                  className="textarea"
                  value={swarmForm.members}
                  onChange={(event) =>
                    setSwarmForm((current) => ({
                      ...current,
                      members: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">Pool limit</span>
                <input
                  className="input"
                  value={swarmForm.poolLimit}
                  onChange={(event) =>
                    setSwarmForm((current) => ({
                      ...current,
                      poolLimit: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="button-primary"
                onClick={() => swarmMutation.mutate()}
              >
                Configure swarm
              </button>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
