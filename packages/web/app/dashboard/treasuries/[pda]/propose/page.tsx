"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card } from "@/components/global";
import {
  PolicyPreview,
  ProposalModeSelector,
  ProposalSuccess,
  ProposeHeader,
  TransactionDetailsForm,
} from "@/components/propose";
import {
  buildProposeTransactionArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import { useAppSettings, useAuraClient, useTreasury } from "@/lib/hooks";

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
  const [showPreview, setShowPreview] = useState(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proposeMutation.mutate();
  };

  if (signature) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 lg:py-20">
        <ProposalSuccess signature={signature} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 lg:py-20">
      <ProposeHeader treasury={entry} network={settings.network} />

      <section className="space-y-8">
        <Card hover={false} className="p-8 md:p-12">
          <form onSubmit={handleSubmit} className="space-y-10">
            <TransactionDetailsForm form={form} setForm={setForm} />

            <ProposalModeSelector mode={mode} onModeChange={setMode} />

            <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row gap-4">
              <Button
                type="button"
                variant="secondary"
                className="px-8 py-4"
                disabled={showPreview}
                onClick={() => setShowPreview(true)}
              >
                PREVIEW POLICY CHECK
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="px-12 py-4"
                loading={proposeMutation.isPending}
                disabled={!wallet.publicKey || !entry}
              >
                SUBMIT PROPOSAL
              </Button>
            </div>

            {proposeMutation.error && (
              <div className="rounded-sm border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
                {proposeMutation.error instanceof Error
                  ? proposeMutation.error.message
                  : "Unknown error"}
              </div>
            )}
          </form>
        </Card>

        {showPreview && <PolicyPreview preview={preview} />}
      </section>
    </div>
  );
}
