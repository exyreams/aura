"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader, StatusPill, Surface } from "@/components/app/ui";
import {
  buildProposeTransactionArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import { useAppSettings, useAuraClient, useTreasury } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

const initialForm = {
  amountUsd: "6400",
  chain: "2",
  txType: "1",
  recipient: "",
  protocolId: "",
  expectedOutputUsd: "",
  actualOutputUsd: "",
  quoteAgeSecs: "6",
  counterpartyRiskScore: "18",
};

export default function ProposeTransactionPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const [mode, setMode] = useState<"public" | "confidential">("public");
  const [form, setForm] = useState(initialForm);
  const [signature, setSignature] = useState<string | null>(null);

  const preview = useMemo(
    () => ({
      dailyLimitPass:
        Number(form.amountUsd) <=
        Number(entry?.account.policyConfig.dailyLimitUsd.toString() ?? "0"),
      perTxLimitPass:
        Number(form.amountUsd) <=
        Number(entry?.account.policyConfig.perTxLimitUsd.toString() ?? "0"),
      quoteAgePass:
        Number(form.quoteAgeSecs) <=
        Number(entry?.account.policyConfig.maxQuoteAgeSecs?.toString() ?? "0"),
      riskPass:
        Number(form.counterpartyRiskScore) <=
        Number(entry?.account.policyConfig.maxCounterpartyRiskScore ?? "0"),
    }),
    [entry, form.amountUsd, form.counterpartyRiskScore, form.quoteAgeSecs],
  );

  const proposeMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      if (mode === "confidential") {
        return await postBackend<{ signature: string }>(
          settings.backendUrl,
          "/v1/confidential/propose",
          {
            rpcUrl: settings.endpoint,
            programId: settings.programId || undefined,
            treasury: pda,
            amountUsd: Number(form.amountUsd),
            chain: Number(form.chain),
            txType: Number(form.txType),
            recipient: form.recipient,
            protocolId: form.protocolId ? Number(form.protocolId) : undefined,
            expectedOutputUsd: form.expectedOutputUsd
              ? Number(form.expectedOutputUsd)
              : undefined,
            actualOutputUsd: form.actualOutputUsd
              ? Number(form.actualOutputUsd)
              : undefined,
            quoteAgeSecs: form.quoteAgeSecs
              ? Number(form.quoteAgeSecs)
              : undefined,
            counterpartyRiskScore: form.counterpartyRiskScore
              ? Number(form.counterpartyRiskScore)
              : undefined,
            waitForOutput: true,
          },
        );
      }
      const args = buildProposeTransactionArgs({
        amountUsd: Number(form.amountUsd),
        chain: Number(form.chain),
        txType: Number(form.txType),
        recipient: form.recipient,
        protocolId: form.protocolId ? Number(form.protocolId) : undefined,
        expectedOutputUsd: form.expectedOutputUsd
          ? Number(form.expectedOutputUsd)
          : undefined,
        actualOutputUsd: form.actualOutputUsd
          ? Number(form.actualOutputUsd)
          : undefined,
        quoteAgeSecs: form.quoteAgeSecs ? Number(form.quoteAgeSecs) : undefined,
        counterpartyRiskScore: form.counterpartyRiskScore
          ? Number(form.counterpartyRiskScore)
          : undefined,
      });
      const instruction = await client.proposeTransactionInstruction(
        { aiAuthority: wallet.publicKey, treasury: entry.publicKey },
        args,
      );
      return {
        signature: await sendWalletInstructions(connection, wallet, [
          instruction,
        ]),
      };
    },
    onSuccess: async (result) => {
      setSignature(result.signature);
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Propose Transaction"
        title="Submit a policy-aware proposal."
        copy={`Public mode uses the connected wallet, while confidential mode delegates Encrypt-backed proposal submission to the backend for ${shortenAddress(pda, 8, 8)}.`}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface
          title="Proposal Form"
          copy="Both submission paths are live. Use the dedicated Confidential page for the full decryption and finalize lifecycle after submission."
        >
          <div className="space-y-5">
            <div className="flex gap-3">
              <button
                type="button"
                className={
                  mode === "public" ? "button-primary" : "button-secondary"
                }
                onClick={() => setMode("public")}
              >
                Public
              </button>
              <button
                type="button"
                className={
                  mode === "confidential"
                    ? "button-primary"
                    : "button-secondary"
                }
                onClick={() => setMode("confidential")}
              >
                Confidential
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Amount (USD cents)", "amountUsd"],
                ["Target chain", "chain"],
                ["Transaction type", "txType"],
                ["Recipient address", "recipient"],
                ["Protocol ID", "protocolId"],
                ["Expected output", "expectedOutputUsd"],
                ["Actual output", "actualOutputUsd"],
                ["Quote age", "quoteAgeSecs"],
                ["Counterparty risk", "counterpartyRiskScore"],
              ].map(([label, key]) => (
                <label
                  key={key}
                  className={key === "recipient" ? "md:col-span-2" : ""}
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
                  />
                </label>
              ))}
            </div>

            <div className="rounded-[1.3rem] border border-cyan-400/16 bg-cyan-400/8 p-4 text-sm leading-7 text-slate-300">
              {mode === "confidential"
                ? "Confidential mode submits through the backend signer. Continue the decryption and execution steps on the Confidential page."
                : "Public mode sends the real instruction through the connected wallet."}
            </div>

            {mode === "confidential" ? (
              <Link
                href={`/app/treasuries/${pda}/confidential`}
                className="button-secondary justify-between"
              >
                Open Confidential Lifecycle
              </Link>
            ) : null}

            <button
              type="button"
              className="button-primary"
              onClick={() => proposeMutation.mutate()}
              disabled={proposeMutation.isPending}
            >
              {proposeMutation.isPending ? "Submitting..." : "Submit Proposal"}
            </button>
          </div>
        </Surface>

        <div className="space-y-6">
          <Surface
            title="Real-time Policy Preview"
            copy="Client-side checks against the fetched treasury config."
          >
            <div className="space-y-3">
              {[
                ["Daily limit", preview.dailyLimitPass ? "Pass" : "Fail"],
                [
                  "Per-transaction limit",
                  preview.perTxLimitPass ? "Pass" : "Fail",
                ],
                ["Quote age", preview.quoteAgePass ? "Pass" : "Fail"],
                ["Counterparty risk", preview.riskPass ? "Pass" : "Fail"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3"
                >
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-sm font-medium text-white">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Surface>

          <Surface
            title="Result Panel"
            copy="Transaction response after submit."
          >
            {signature ? (
              <div className="rounded-[1.3rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">Proposal submitted</p>
                  <StatusPill status="Approved" />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Signature{" "}
                  <span className="mono text-emerald-100">{signature}</span>
                </p>
              </div>
            ) : proposeMutation.error ? (
              <div className="rounded-[1.3rem] border border-rose-400/16 bg-rose-400/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">Submission failed</p>
                  <StatusPill status="Denied" />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {proposeMutation.error instanceof Error
                    ? proposeMutation.error.message
                    : "Unknown error"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No result yet. Submit a proposal to see the transaction outcome.
              </p>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}
