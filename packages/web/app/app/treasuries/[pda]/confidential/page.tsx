"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/app/ui";
import { parsePublicKey, sendWalletInstructions } from "@/lib/aura-app";
import { useAuraClient, useTreasury } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

export default function ConfidentialPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const account = entry?.account;

  const [scalarForm, setScalarForm] = useState({
    dailyLimitCiphertext:
      account?.confidentialGuardrails?.dailyLimitCiphertext?.toBase58() ?? "",
    perTxLimitCiphertext:
      account?.confidentialGuardrails?.perTxLimitCiphertext?.toBase58() ?? "",
    spentTodayCiphertext:
      account?.confidentialGuardrails?.spentTodayCiphertext?.toBase58() ?? "",
  });
  const [vectorCiphertext, setVectorCiphertext] = useState(
    account?.confidentialGuardrails?.guardrailVectorCiphertext?.toBase58() ??
      "",
  );

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Confidential Setup"
        title="Configure FHE guardrails."
        copy={`This page submits the real guardrail configuration instructions for ${shortenAddress(pda, 8, 8)}. Ciphertext creation and Encrypt deposit UX are the remaining bridge pieces.`}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface title="Current Guardrails Status">
          <div className="space-y-3 rounded-[1.3rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
            <p>
              Mode:{" "}
              <span className="text-white">
                {account?.confidentialGuardrails?.guardrailVectorCiphertext
                  ? "Vector"
                  : account?.confidentialGuardrails
                    ? "Scalar"
                    : "Not configured"}
              </span>
            </p>
            <p className="mono">
              daily_limit_ciphertext:{" "}
              {account?.confidentialGuardrails?.dailyLimitCiphertext?.toBase58() ??
                "n/a"}
            </p>
            <p className="mono">
              per_tx_ciphertext:{" "}
              {account?.confidentialGuardrails?.perTxLimitCiphertext?.toBase58() ??
                "n/a"}
            </p>
            <p className="mono">
              spent_today_ciphertext:{" "}
              {account?.confidentialGuardrails?.spentTodayCiphertext?.toBase58() ??
                "n/a"}
            </p>
            <p className="mono">
              vector_ciphertext:{" "}
              {account?.confidentialGuardrails?.guardrailVectorCiphertext?.toBase58() ??
                "n/a"}
            </p>
          </div>
        </Surface>

        <Surface title="Encryption Status">
          <div className="rounded-[1.3rem] border border-cyan-400/16 bg-cyan-400/10 p-5">
            <div className="flex items-center gap-3 text-cyan-100">
              <LoaderCircle className="h-5 w-5" />
              <p className="font-medium">Instruction path is wired</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              The page now submits real scalar and vector guardrail
              configuration instructions. Auto-encrypting plaintext values and
              ensuring the Encrypt deposit account are the remaining UI pieces
              to expose.
            </p>
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface title="Configure Scalar Guardrails">
          <div className="grid gap-4">
            {[
              ["Daily limit ciphertext", "dailyLimitCiphertext"],
              ["Per-tx ciphertext", "perTxLimitCiphertext"],
              ["Spent today ciphertext", "spentTodayCiphertext"],
            ].map(([label, key]) => (
              <label key={key}>
                <span className="field-label">{label}</span>
                <input
                  className="input mono"
                  value={scalarForm[key as keyof typeof scalarForm]}
                  onChange={(event) =>
                    setScalarForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="button-primary"
              onClick={() => scalarMutation.mutate()}
            >
              Configure scalar guardrails
            </button>
          </div>
        </Surface>

        <Surface title="Configure Vector Guardrails">
          <div className="space-y-4">
            <label>
              <span className="field-label">Vector ciphertext</span>
              <input
                className="input mono"
                value={vectorCiphertext}
                onChange={(event) => setVectorCiphertext(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              onClick={() => vectorMutation.mutate()}
            >
              Submit vector ciphertext
            </button>
          </div>
        </Surface>
      </div>

      <Surface title="Pre-alpha Disclaimer">
        <p className="text-sm leading-7 text-slate-300">
          The AURA instruction path is live here, but the Encrypt-side UX still
          needs one more pass so users can mint ciphertexts and deposit credits
          from the web app instead of supplying existing ciphertext accounts.
        </p>
      </Surface>
    </div>
  );
}
