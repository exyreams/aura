"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  formatProposalStatus,
  formatViolation,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import { useAppSettings, useAuraClient, useTreasury } from "@/lib/hooks";
import { usePersistentState } from "@/lib/settings";
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

  const [mode, setMode] = usePersistentState<"public" | "confidential">(
    `aura:proposal-mode:${pda}`,
    "public",
  );
  const [form, setForm] = usePersistentState(
    `aura:proposal-form:${pda}`,
    initialForm,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [lifecycleState, setLifecycleState] = useState({
    policyOutputCiphertext:
      entry?.account.pending?.policyOutputCiphertextAccount?.toString() ?? "",
    requestAccount:
      entry?.account.pending?.decryptionRequest?.requestAccount?.toString() ??
      "",
    messageApproval:
      entry?.account.pending?.signatureRequest?.messageApprovalAccount?.toString() ??
      "",
  });

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

  useEffect(() => {
    if (!entry?.account) {
      return;
    }

    setLifecycleState({
      policyOutputCiphertext:
        entry.account.pending?.policyOutputCiphertextAccount?.toString() ?? "",
      requestAccount:
        entry.account.pending?.decryptionRequest?.requestAccount?.toString() ??
        "",
      messageApproval:
        entry.account.pending?.signatureRequest?.messageApprovalAccount?.toString() ??
        "",
    });
  }, [entry]);

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
      if (mode === "public") {
        setSignature(result.signature);
      } else {
        const confidentialResult = result as {
          policyOutputCiphertext?: string;
        };
        setLifecycleState((current) => ({
          ...current,
          policyOutputCiphertext:
            confidentialResult.policyOutputCiphertext ??
            current.policyOutputCiphertext,
        }));
      }
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  const requestDecryptionMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        signature: string;
        requestAccount: string;
        ciphertext: string;
      }>(settings.backendUrl, "/v1/confidential/request-decryption", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        treasury: pda,
        ciphertext: lifecycleState.policyOutputCiphertext || undefined,
        wait: true,
      }),
    onSuccess: async (result) => {
      setLifecycleState((current) => ({
        ...current,
        requestAccount: result.requestAccount,
      }));
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const confirmDecryptionMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        signature: string;
        approved: boolean | null;
        violation: number | null;
        violationCode: string | null;
      }>(settings.backendUrl, "/v1/confidential/confirm-decryption", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        treasury: pda,
        requestAccount: lifecycleState.requestAccount || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        signature: string;
        approved: boolean;
        messageApproval?: string;
      }>(settings.backendUrl, "/v1/execution/execute", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        treasury: pda,
        wait: true,
        waitSigned: true,
      }),
    onSuccess: async (result) => {
      setLifecycleState((current) => ({
        ...current,
        messageApproval: result.messageApproval ?? current.messageApproval,
      }));
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        signature: string;
        totalTransactions: string;
      }>(settings.backendUrl, "/v1/execution/finalize", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        treasury: pda,
        messageApproval: lifecycleState.messageApproval || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proposeMutation.mutate();
  };

  const pending = entry?.account.pending;
  const canRequestDecryption = Boolean(
    lifecycleState.policyOutputCiphertext ||
      pending?.policyOutputCiphertextAccount,
  );
  const canConfirmDecryption = Boolean(
    lifecycleState.requestAccount || pending?.decryptionRequest?.requestAccount,
  );
  const canExecutePending = Boolean(pending);
  const canFinalize = Boolean(
    lifecycleState.messageApproval ||
      pending?.signatureRequest?.messageApprovalAccount,
  );

  if (signature && mode === "public") {
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

            {mode === "confidential" ? (
              <div className="rounded-sm border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
                Submit through the backend signer, then continue the decryption,
                execution, and finalize lifecycle below for{" "}
                <span className="font-mono text-white">
                  {shortenAddress(pda, 8, 8)}
                </span>
                .
              </div>
            ) : null}

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

        {mode === "confidential" ? (
          <Card hover={false} className="p-8 md:p-12">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted)">
                  Confidential Lifecycle
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-(--text-main)">
                  Complete the backend-assisted execution path
                </h2>
              </div>
              <div className="rounded-full border border-white/8 bg-white/4 px-4 py-2 text-xs text-slate-300">
                {pending
                  ? `${formatProposalStatus(pending.status)}${
                      pending.decision.violation
                        ? ` • ${formatViolation(pending.decision.violation)}`
                        : ""
                    }`
                  : "No pending confidential proposal"}
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-sm border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
                  <p className="font-mono text-[11px] text-white">
                    policy_output
                  </p>
                  <p className="mt-1 break-all">
                    {lifecycleState.policyOutputCiphertext || "n/a"}
                  </p>
                </div>
                <div className="rounded-sm border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
                  <p className="font-mono text-[11px] text-white">
                    request_account
                  </p>
                  <p className="mt-1 break-all">
                    {lifecycleState.requestAccount || "n/a"}
                  </p>
                </div>
                <div className="rounded-sm border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
                  <p className="font-mono text-[11px] text-white">
                    message_approval
                  </p>
                  <p className="mt-1 break-all">
                    {lifecycleState.messageApproval || "n/a"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={requestDecryptionMutation.isPending}
                  disabled={!canRequestDecryption}
                  onClick={() => requestDecryptionMutation.mutate()}
                >
                  Request Policy Decryption
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={confirmDecryptionMutation.isPending}
                  disabled={!canConfirmDecryption}
                  onClick={() => confirmDecryptionMutation.mutate()}
                >
                  Confirm Policy Decryption
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={executeMutation.isPending}
                  disabled={!canExecutePending}
                  onClick={() => executeMutation.mutate()}
                >
                  Execute Pending
                </Button>
                <Button
                  variant="primary"
                  className="w-full"
                  loading={finalizeMutation.isPending}
                  disabled={!canFinalize}
                  onClick={() => finalizeMutation.mutate()}
                >
                  Finalize Execution
                </Button>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {[
                proposeMutation,
                requestDecryptionMutation,
                confirmDecryptionMutation,
                executeMutation,
                finalizeMutation,
              ]
                .map((mutation) =>
                  mutation.error instanceof Error
                    ? mutation.error.message
                    : null,
                )
                .filter(Boolean)
                .map((message) => (
                  <div
                    key={message}
                    className="rounded-sm border border-danger/20 bg-danger/10 p-4 text-sm text-danger"
                  >
                    {message}
                  </div>
                ))}

              {confirmDecryptionMutation.data ? (
                <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  Decryption confirmed. Approved:{" "}
                  <span className="text-white">
                    {String(confirmDecryptionMutation.data.approved)}
                  </span>
                  {confirmDecryptionMutation.data.violationCode ? (
                    <span className="text-slate-200">
                      {" "}
                      • Violation code{" "}
                      {confirmDecryptionMutation.data.violationCode}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {executeMutation.data ? (
                <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  Execution submitted with signature{" "}
                  <span className="font-mono text-white">
                    {executeMutation.data.signature}
                  </span>
                  .
                </div>
              ) : null}

              {finalizeMutation.data ? (
                <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  Finalize submitted with signature{" "}
                  <span className="font-mono text-white">
                    {finalizeMutation.data.signature}
                  </span>
                  .
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
