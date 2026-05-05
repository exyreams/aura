"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CurrentEncryptedState,
  type EncryptionMode,
  EncryptionModeSelector,
  GuardrailsHeader,
  ScalarConfigForm,
  VectorConfigForm,
} from "@/components/guardrails";
import { parsePublicKey, sendWalletInstructions } from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import {
  useAgents,
  useAppSettings,
  useAuraClient,
  useBackendInfo,
  useTreasury,
} from "@/lib/hooks";

export default function ConfidentialGuardrailsPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const backendInfoQuery = useBackendInfo();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const account = entry?.account;

  const [mode, setMode] = useState<EncryptionMode>("scalar");
  const [scalarForm, setScalarForm] = useState({
    dailyLimitCiphertext:
      account?.confidentialGuardrails?.dailyLimitCiphertext?.toBase58() ?? "",
    perTxLimitCiphertext:
      account?.confidentialGuardrails?.perTxLimitCiphertext?.toBase58() ?? "",
    spentTodayCiphertext:
      account?.confidentialGuardrails?.spentTodayCiphertext?.toBase58() ?? "",
  });
  const [plaintextForm, setPlaintextForm] = useState({
    dailyLimit: account?.policyConfig.dailyLimitUsd.toString() ?? "15000",
    perTxLimit: account?.policyConfig.perTxLimitUsd.toString() ?? "5000",
    spentToday: account?.policyState.spentTodayUsd.toString() ?? "0",
  });
  const [vectorCiphertext, setVectorCiphertext] = useState(
    account?.confidentialGuardrails?.guardrailVectorCiphertext?.toBase58() ??
      "",
  );

  useEffect(() => {
    if (!account) {
      return;
    }
    setScalarForm({
      dailyLimitCiphertext:
        account.confidentialGuardrails?.dailyLimitCiphertext?.toBase58() ?? "",
      perTxLimitCiphertext:
        account.confidentialGuardrails?.perTxLimitCiphertext?.toBase58() ?? "",
      spentTodayCiphertext:
        account.confidentialGuardrails?.spentTodayCiphertext?.toBase58() ?? "",
    });
    setPlaintextForm({
      dailyLimit: account.policyConfig.dailyLimitUsd.toString(),
      perTxLimit: account.policyConfig.perTxLimitUsd.toString(),
      spentToday: account.policyState.spentTodayUsd.toString(),
    });
    setVectorCiphertext(
      account.confidentialGuardrails?.guardrailVectorCiphertext?.toBase58() ??
        "",
    );
    if (account.confidentialGuardrails?.guardrailVectorCiphertext) {
      setMode("vector");
    } else if (account.confidentialGuardrails) {
      setMode("scalar");
    }
  }, [account]);

  const ensureDepositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before funding the Encrypt deposit.",
        );
      }
      return postBackend<{
        created: boolean;
        signature?: string;
        accounts: Record<string, string>;
      }>(settings.backendUrl, "/v1/confidential/deposit/ensure", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        agentId: selectedAgent.agentId,
      });
    },
  });

  const encryptScalarMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        dailyLimitCiphertext: string;
        perTxLimitCiphertext: string;
        spentTodayCiphertext: string;
      }>(settings.backendUrl, "/v1/confidential/encrypt-scalar", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        dailyLimit: Number(plaintextForm.dailyLimit),
        perTxLimit: Number(plaintextForm.perTxLimit),
        spentToday: Number(plaintextForm.spentToday),
        wait: true,
      }),
    onSuccess: (result) => {
      setScalarForm({
        dailyLimitCiphertext: result.dailyLimitCiphertext,
        perTxLimitCiphertext: result.perTxLimitCiphertext,
        spentTodayCiphertext: result.spentTodayCiphertext,
      });
    },
  });

  const scalarMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const instruction =
        await client.configureConfidentialGuardrailsInstruction(
          {
            owner: wallet.publicKey,
            treasury: entry.publicKey,
            dailyLimitCiphertext: parsePublicKey(
              scalarForm.dailyLimitCiphertext,
            ),
            perTxLimitCiphertext: parsePublicKey(
              scalarForm.perTxLimitCiphertext,
            ),
            spentTodayCiphertext: parsePublicKey(
              scalarForm.spentTodayCiphertext,
            ),
          },
          Math.floor(Date.now() / 1000),
        );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const vectorMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const instruction =
        await client.configureConfidentialVectorGuardrailsInstruction(
          {
            owner: wallet.publicKey,
            treasury: entry.publicKey,
            guardrailVectorCiphertext: parsePublicKey(vectorCiphertext),
          },
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
      </div>

      <main className="max-w-5xl mx-auto px-8 py-12 relative z-10">
        <GuardrailsHeader treasury={entry} />

        <EncryptionModeSelector mode={mode} onModeChange={setMode} />

        {mode === "scalar" ? (
          <ScalarConfigForm
            account={account}
            plaintextForm={plaintextForm}
            setPlaintextForm={setPlaintextForm}
            scalarForm={scalarForm}
            setScalarForm={setScalarForm}
            encryptScalarMutation={encryptScalarMutation}
            scalarMutation={scalarMutation}
            backendUrl={settings.backendUrl}
            backendInfo={backendInfoQuery.data}
            selectedAgentPublicKey={selectedAgent?.publicKey}
            ensureDepositMutation={ensureDepositMutation}
          />
        ) : (
          <VectorConfigForm
            account={account}
            vectorCiphertext={vectorCiphertext}
            setVectorCiphertext={setVectorCiphertext}
            vectorMutation={vectorMutation}
          />
        )}

        <CurrentEncryptedState account={account} />
      </main>
    </div>
  );
}
