"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { PageHeader, Surface } from "@/components/app/ui";
import {
  buildCreateTreasuryArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { useAppSettings, useAuraClient } from "@/lib/hooks";

const initialForm = {
  agentId: "",
  aiAuthority: "",
  dailyLimitUsd: "95000",
  perTxLimitUsd: "22000",
  daytimeHourlyLimitUsd: "9500",
  nighttimeHourlyLimitUsd: "4750",
  velocityLimitUsd: "47500",
  maxSlippageBps: "100",
  maxQuoteAgeSecs: "300",
  pendingTransactionTtlSecs: "900",
  maxCounterpartyRiskScore: "70",
  bitcoinManualReviewThresholdUsd: "5000",
};

export default function CreateTreasuryPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<{
    treasury: string;
    signature: string;
  } | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet first.");
      }
      const args = buildCreateTreasuryArgs({
        agentId: form.agentId,
        aiAuthority: form.aiAuthority.trim()
          ? new PublicKey(form.aiAuthority.trim())
          : wallet.publicKey,
        dailyLimitUsd: Number(form.dailyLimitUsd),
        perTxLimitUsd: Number(form.perTxLimitUsd),
        daytimeHourlyLimitUsd: Number(form.daytimeHourlyLimitUsd),
        nighttimeHourlyLimitUsd: Number(form.nighttimeHourlyLimitUsd),
        velocityLimitUsd: Number(form.velocityLimitUsd),
        maxSlippageBps: Number(form.maxSlippageBps),
        maxQuoteAgeSecs: Number(form.maxQuoteAgeSecs),
        pendingTransactionTtlSecs: Number(form.pendingTransactionTtlSecs),
        maxCounterpartyRiskScore: Number(form.maxCounterpartyRiskScore),
        bitcoinManualReviewThresholdUsd: Number(
          form.bitcoinManualReviewThresholdUsd,
        ),
      });
      const { treasury, instruction } = await client.createTreasuryInstruction({
        owner: wallet.publicKey,
        args,
      });
      const signature = await sendWalletInstructions(connection, wallet, [
        instruction,
      ]);
      return { treasury: treasury.toBase58(), signature };
    },
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Create Treasury"
        title="Provision a new agent treasury."
        copy={`Submit the actual create_treasury instruction against ${settings.network}.`}
      />

      <Surface title="Treasury Form">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Agent ID", "agentId"],
            ["AI authority pubkey", "aiAuthority"],
            ["Daily limit (USD cents)", "dailyLimitUsd"],
            ["Per-tx limit (USD cents)", "perTxLimitUsd"],
            ["Daytime hourly limit", "daytimeHourlyLimitUsd"],
            ["Nighttime hourly limit", "nighttimeHourlyLimitUsd"],
            ["Velocity limit", "velocityLimitUsd"],
            ["Max slippage bps", "maxSlippageBps"],
            ["Max quote age secs", "maxQuoteAgeSecs"],
            ["TTL secs", "pendingTransactionTtlSecs"],
            ["Max risk score", "maxCounterpartyRiskScore"],
            ["BTC manual review threshold", "bitcoinManualReviewThresholdUsd"],
          ].map(([label, key]) => (
            <label
              key={key}
              className={key === "agentId" || key === "aiAuthority" ? "" : ""}
            >
              <span className="field-label">{label}</span>
              <input
                className="input"
                value={form[key as keyof typeof form]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder={
                  key === "aiAuthority" ? wallet.publicKey?.toBase58() : ""
                }
              />
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="button-primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Submitting..." : "Create Treasury"}
          </button>
          {createMutation.error ? (
            <p className="text-sm text-rose-300">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Transaction failed"}
            </p>
          ) : null}
        </div>
      </Surface>

      {result ? (
        <Surface title="Confirmation">
          <div className="flex flex-col gap-4 rounded-[1.4rem] border border-emerald-400/16 bg-emerald-400/10 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/16 text-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-white">
                  Treasury created on-chain
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  PDA:{" "}
                  <span className="mono text-emerald-100">
                    {result.treasury}
                  </span>
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Signature:{" "}
                  <span className="mono text-emerald-100">
                    {result.signature}
                  </span>
                </p>
              </div>
            </div>
            <a
              className="button-secondary"
              href={`/app/treasuries/${result.treasury}`}
            >
              Open detail page
            </a>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
