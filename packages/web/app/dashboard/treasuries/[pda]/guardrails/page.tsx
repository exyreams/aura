"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey, Transaction } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CurrentEncryptedState,
  EncryptionModeSelector,
  GuardrailsHeader,
  ScalarConfigForm,
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

  // Prevent the account-sync useEffect from overwriting ciphertexts the user
  // just generated (but hasn't submitted yet).
  const scalarDirtyRef = useRef(false);
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
  // Check whether the encrypted ciphertext accounts actually exist on-chain
  // before allowing the configure instruction to be submitted.
  const ciphertextAddresses = [
    scalarForm.dailyLimitCiphertext,
    scalarForm.perTxLimitCiphertext,
    scalarForm.spentTodayCiphertext,
  ].filter(Boolean);

  const ciphertextExistenceQuery = useQuery({
    queryKey: ["ciphertext-existence", ...ciphertextAddresses],
    queryFn: async () => {
      const results = await Promise.all(
        ciphertextAddresses.map(async (addr) => {
          try {
            const info = await connection.getAccountInfo(
              parsePublicKey(addr),
              "confirmed",
            );
            return {
              addr,
              exists: info !== null,
              dataLen: info?.data.length ?? 0,
            };
          } catch {
            return { addr, exists: false, dataLen: 0 };
          }
        }),
      );
      return results;
    },
    enabled: ciphertextAddresses.length === 3,
    refetchInterval: 3_000,
  });

  const allCiphertextsExist =
    ciphertextAddresses.length === 3 &&
    (ciphertextExistenceQuery.data?.every((r) => r.exists) ?? false);

  useEffect(() => {
    if (!account) {
      return;
    }
    // Only sync ciphertext fields from on-chain if they actually have values.
    // If they're empty on-chain (guardrails not configured yet), leave whatever
    // the user or encryptScalarMutation already put in the fields alone.
    const onChainDaily =
      account.confidentialGuardrails?.dailyLimitCiphertext?.toBase58() ?? "";
    const onChainPerTx =
      account.confidentialGuardrails?.perTxLimitCiphertext?.toBase58() ?? "";
    const onChainSpent =
      account.confidentialGuardrails?.spentTodayCiphertext?.toBase58() ?? "";

    if (
      !scalarDirtyRef.current &&
      (onChainDaily || onChainPerTx || onChainSpent)
    ) {
      setScalarForm({
        dailyLimitCiphertext: onChainDaily,
        perTxLimitCiphertext: onChainPerTx,
        spentTodayCiphertext: onChainSpent,
      });
    }

    setPlaintextForm({
      dailyLimit: account.policyConfig.dailyLimitUsd.toString(),
      perTxLimit: account.policyConfig.perTxLimitUsd.toString(),
      spentToday: account.policyState.spentTodayUsd.toString(),
    });

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
      scalarDirtyRef.current = true;
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

      // Validate ciphertext addresses before building the instruction
      let dailyKey: PublicKey;
      let perTxKey: PublicKey;
      let spentKey: PublicKey;
      try {
        dailyKey = parsePublicKey(scalarForm.dailyLimitCiphertext);
        perTxKey = parsePublicKey(scalarForm.perTxLimitCiphertext);
        spentKey = parsePublicKey(scalarForm.spentTodayCiphertext);
      } catch {
        throw new Error(
          "One or more ciphertext addresses are invalid. Re-run Encrypt Plaintext Values and try again.",
        );
      }

      const instruction =
        await client.configureConfidentialGuardrailsInstruction(
          {
            owner: wallet.publicKey,
            treasury: entry.publicKey,
            dailyLimitCiphertext: dailyKey,
            perTxLimitCiphertext: perTxKey,
            spentTodayCiphertext: spentKey,
          },
          Math.floor(Date.now() / 1000),
        );

      // Simulate first to get readable logs before sending to wallet
      const simTx = new Transaction().add(instruction);
      simTx.feePayer = wallet.publicKey;
      const { blockhash: simBlockhash } =
        await connection.getLatestBlockhash("confirmed");
      simTx.recentBlockhash = simBlockhash;
      const sim = await connection.simulateTransaction(simTx);
      if (sim.value.err) {
        const logs = sim.value.logs ?? [];
        const programErr = logs.find(
          (l) =>
            l.includes("Error") || l.includes("error") || l.includes("failed"),
        );
        const enriched = new Error(
          programErr ?? `Simulation failed: ${JSON.stringify(sim.value.err)}`,
        ) as Error & { logs: string[] };
        enriched.logs = logs;
        throw enriched;
      }

      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      scalarDirtyRef.current = false;
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

        <EncryptionModeSelector
          active={Boolean(account?.confidentialGuardrails?.dailyLimitCiphertext)}
        />

        <ScalarConfigForm
          account={account}
          plaintextForm={plaintextForm}
          setPlaintextForm={setPlaintextForm}
          scalarForm={scalarForm}
          setScalarForm={setScalarForm}
          encryptScalarMutation={encryptScalarMutation}
          scalarMutation={scalarMutation}
          backendInfo={backendInfoQuery.data}
          selectedAgentPublicKey={selectedAgent?.publicKey}
          ensureDepositMutation={ensureDepositMutation}
          allCiphertextsExist={allCiphertextsExist}
          ciphertextExistence={ciphertextExistenceQuery.data}
        />

        <CurrentEncryptedState account={account} />
      </main>
    </div>
  );
}
