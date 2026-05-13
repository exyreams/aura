"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import {
  Check,
  ExternalLink,
  Lock,
  ShieldAlert,
  Wallet,
} from "@/components/icons";
import {
  buildProposeTransactionArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { LONG_TIMEOUT_MS, postBackend } from "@/lib/backend-client";
import {
  useAgents,
  useAppSettings,
  useAuraClient,
  useTreasury,
} from "@/lib/hooks";
import { usePersistentState } from "@/lib/settings";
import { shortenAddress } from "@/lib/utils";
import { PolicyPreview } from "./PolicyPreview";
import { ProposalModeSelector } from "./ProposalModeSelector";
import { TransactionDetailsForm } from "./TransactionDetailsForm";

const initialForm = {
  amountUsd: "",
  chain: "2",
  txType: "1",
  recipient: "",
  protocolId: "",
  expectedOutputUsd: "",
  actualOutputUsd: "",
  quoteAgeSecs: "6",
  counterpartyRiskScore: "18",
};

interface ProposeTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pda: string;
}

function sanitizeProposalError(msg: string): string {
  if (/user rejected|rejected the request|user denied/i.test(msg))
    return "Transaction cancelled by wallet.";
  if (/wallet not connected|no wallet|connect.*wallet/i.test(msg))
    return "No wallet connected. Connect a wallet and try again.";
  if (/insufficient funds for rent/i.test(msg))
    return "Not enough SOL to cover rent. Top up your wallet and try again.";
  if (/insufficient lamports|insufficient funds/i.test(msg))
    return "Insufficient funds to complete this transaction.";
  if (/0x1\b/.test(msg))
    return "Not enough SOL in your wallet. Fund it with devnet SOL and try again.";
  if (/memory allocation failed|out of memory|SBF program panicked/i.test(msg))
    return "A proposal is already active on this treasury. Cancel the existing proposal before submitting a new one.";
  if (/blockhash not found|blockhash.*expired/i.test(msg))
    return "Transaction expired — the network was too slow. Please try again.";
  if (/was not confirmed|transaction not confirmed/i.test(msg))
    return "Transaction timed out waiting for confirmation. Try again.";
  if (/ttl.*elapsed|proposal.*expired/i.test(msg))
    return "This proposal has expired. Create a new one.";
  if (/0x1783|PendingTransactionExpired|pending transaction expired/i.test(msg))
    return "This proposal has expired (TTL elapsed). Cancel it and create a new one.";
  if (/simulation failed/i.test(msg)) {
    if (
      /0x1783|PendingTransactionExpired|pending transaction expired/i.test(msg)
    )
      return "This proposal has expired (TTL elapsed). Cancel it and create a new one.";
    if (/memory allocation failed|out of memory/i.test(msg))
      return "A proposal is already active on this treasury. Cancel it before submitting a new one.";
    return "Transaction simulation failed. Check your wallet balance and try again.";
  }
  if (/fetch.*fail|network.*error|econnrefused|failed to fetch/i.test(msg))
    return "Could not reach the backend. Check your network connection and backend URL in Settings.";
  if (/timeout|timed out/i.test(msg))
    return "Request timed out. The network may be congested — please try again.";
  if (/execution paused/i.test(msg))
    return "Execution is paused on this treasury. Unpause it before submitting proposals.";
  if (/create and select an agent/i.test(msg))
    return "No agent selected. Create and select an agent first.";
  if (/agent.*not found|invalid.*agent/i.test(msg))
    return "Agent not found. Select a valid agent in the agent panel.";
  // Strip UUIDs and Program log prefixes from fallback
  return msg
    .replace(/\s*\([0-9a-f-]{36}\)\s*$/i, "")
    .replace(/^Program log:\s*/i, "")
    .replace(/Simulation failed\.\s*Message:\s*/i, "")
    .replace(/Transaction simulation failed:\s*/i, "")
    .replace(/Error processing Instruction \d+:\s*/i, "")
    .replace(/\.\s*Logs:[\s\S]*$/i, "")
    .trim();
}

export function ProposeTransactionModal({
  isOpen,
  onClose,
  pda,
}: ProposeTransactionModalProps) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;

  // null = still loading, false = not configured, true = ready
  const confidentialReady: boolean | null = entry
    ? Boolean(entry.account.confidentialGuardrails)
    : null;

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
  const proposedRef = useRef(false);

  // Reset form to initial state every time the modal closes so the next open is always fresh
  useEffect(() => {
    if (!isOpen) {
      setForm(initialForm);
    }
  }, [isOpen, setForm]);

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
      if (!entry) throw new Error("Treasury not loaded.");
      const selectedAgentId = selectedAgent?.agentId;

      const aiAuthority = entry.account.aiAuthority?.toString?.() ?? "";
      const walletIsAiAuthority =
        wallet.publicKey && aiAuthority === wallet.publicKey.toBase58();

      if (mode === "confidential") {
        if (!selectedAgentId) {
          throw new Error(
            "Create and select an agent before using confidential proposals.",
          );
        }
        return await postBackend<{
          signature: string;
          executeSignature?: string;
          policyOutputCiphertext?: string;
        }>(
          settings.backendUrl,
          "/v1/confidential/propose",
          {
            rpcUrl: settings.endpoint,
            programId: settings.programId || undefined,
            agentId: selectedAgentId,
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
            waitForOutput: false,
          },
          { timeoutMs: LONG_TIMEOUT_MS },
        );
      }

      if (!walletIsAiAuthority) {
        if (!selectedAgentId) {
          throw new Error(
            "Create and select an agent before backend-signed proposals.",
          );
        }
        return await postBackend<{ signature: string }>(
          settings.backendUrl,
          "/v1/proposals/public",
          {
            rpcUrl: settings.endpoint,
            programId: settings.programId || undefined,
            agentId: selectedAgentId,
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
          },
        );
      }

      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
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
      proposedRef.current = true;
      if (mode === "public") {
        setSignature(result.signature);
      }
      const policyOutputCiphertext =
        mode === "confidential" &&
        "policyOutputCiphertext" in result &&
        typeof result.policyOutputCiphertext === "string"
          ? result.policyOutputCiphertext
          : null;
      if (policyOutputCiphertext) {
        localStorage.setItem(
          `aura:policy-output-ciphertext:${pda}`,
          policyOutputCiphertext,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proposeMutation.mutate();
  };

  // Reset mutation and signature when modal closes
  useEffect(() => {
    if (!isOpen) {
      proposeMutation.reset();
      setSignature(null);
      proposedRef.current = false;
    }
  }, [isOpen, proposeMutation.reset]);

  // Auto-dismiss error after 6 seconds
  useEffect(() => {
    if (!proposeMutation.error) return;
    const t = setTimeout(() => proposeMutation.reset(), 6000);
    return () => clearTimeout(t);
  }, [proposeMutation.error, proposeMutation.reset]);

  const succeededPublic =
    proposeMutation.isSuccess && signature !== null && mode === "public";
  const succeededConfidential =
    proposeMutation.isSuccess && mode === "confidential";
  const succeeded = succeededPublic || succeededConfidential;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className={succeeded ? "max-w-lg" : "max-w-3xl"}
      footer={
        succeeded ? (
          <Button
            variant="secondary"
            size="medium"
            className="flex-1"
            onClick={onClose}
          >
            Close
          </Button>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            {proposeMutation.error && (
              <Alert
                variant="error"
                message={sanitizeProposalError(
                  proposeMutation.error instanceof Error
                    ? proposeMutation.error.message
                    : "Failed to submit proposal",
                )}
                onClose={() => proposeMutation.reset()}
              />
            )}
            {entry && entry.account.dwallets.length === 0 && (
              <div className="rounded-sm border border-(--warning-border) bg-(--warning-bg) px-4 py-3 flex gap-3 items-start">
                <Wallet
                  className="size-3.5 text-(--warning-text) shrink-0 mt-0.5"
                  animateOnHover
                />
                <p className="text-[11px] text-(--warning-text) leading-relaxed">
                  No dWallet registered — the proposal will evaluate but
                  execution will fail. Register a dWallet on this treasury
                  first.
                </p>
              </div>
            )}
            <div className="flex gap-2 w-full">
              <Button
                variant="secondary"
                size="medium"
                className="flex-1"
                disabled={proposeMutation.isPending}
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? "Hide Preview" : "Preview Policy"}
              </Button>
              <Button
                type="submit"
                form="propose-transaction-form"
                variant="primary"
                size="medium"
                className="flex-1"
                loading={proposeMutation.isPending}
                disabled={
                  !entry ||
                  proposeMutation.isPending ||
                  (mode === "confidential" && !selectedAgent) ||
                  (mode === "confidential" && confidentialReady !== true)
                }
              >
                {proposeMutation.isPending ? "Submitting…" : "Submit Proposal"}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {succeeded ? (
            <m.div
              key="success"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="flex flex-col items-center text-center mb-6">
                {/* // Fix: scale-from-zero in ProposeTransactionModal */}
                <m.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: 0.1,
                    duration: 0.4,
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                  }}
                  className="flex size-14 items-center justify-center rounded-full border border-success/30 bg-success/10 mb-4"
                >
                  <m.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.25, duration: 0.25, type: "spring" }}
                  >
                    <Check className="size-6 text-success" animateOnHover />
                  </m.div>
                </m.div>
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <h3 className="text-lg font-semibold text-(--text-main) tracking-tight">
                    Proposal submitted
                  </h3>
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {succeededConfidential ? (
                      "Confidential proposal broadcast — use the Lifecycle button in Pending Proposals to complete decryption and execution."
                    ) : (
                      <>
                        Broadcast to{" "}
                        <span className="mono text-(--text-main)">
                          {settings.network}
                        </span>{" "}
                        and pending evaluation.
                      </>
                    )}
                  </p>
                </m.div>
              </div>
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="space-y-3"
              >
                {succeededPublic && signature && (
                  <div className="rounded-sm border border-border bg-(--card-content) p-3">
                    <p className="mono text-[9px] uppercase tracking-widest text-(--text-muted) mb-1.5">
                      Transaction Signature
                    </p>
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="flex-1 mono text-[11px] text-success break-all leading-relaxed min-w-0">
                        {signature}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `https://explorer.solana.com/tx/${signature}?cluster=${settings.network}`,
                            "_blank",
                          )
                        }
                        className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
                        aria-label="View on explorer"
                      >
                        <ExternalLink className="size-3.5" animateOnHover />
                      </button>
                    </div>
                  </div>
                )}
                <div className="rounded-sm border border-border bg-(--card-content) p-3">
                  <p className="mono text-[9px] uppercase tracking-widest text-(--text-muted) mb-1.5">
                    Treasury
                  </p>
                  <code className="mono text-[11px] text-(--text-main) break-all">
                    {shortenAddress(pda, 8, 8)}
                  </code>
                </div>
              </m.div>
            </m.div>
          ) : (
            <m.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-6"
            >
              <form
                id="propose-transaction-form"
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <TransactionDetailsForm form={form} setForm={setForm} />
                <ProposalModeSelector mode={mode} onModeChange={setMode} />

                {/* Confidential readiness check */}
                {mode === "confidential" &&
                  (confidentialReady === null ? (
                    <div className="flex items-center gap-3 rounded-sm border border-border bg-(--card-content) px-4 py-3">
                      <Loader2 className="size-4 animate-spin text-(--text-muted) shrink-0" />
                      <p className="text-xs text-(--text-muted) font-mono">
                        Checking confidential guardrails setup…
                      </p>
                    </div>
                  ) : confidentialReady === false ? (
                    <div className="rounded-sm border border-(--warning-border) bg-(--warning-bg) p-4 flex gap-3">
                      <ShieldAlert
                        className="size-4 text-(--warning-text) shrink-0 mt-0.5"
                        animateOnHover
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-(--warning-text) mb-1">
                          Confidential guardrails not configured
                        </p>
                        <p className="text-[11px] text-(--text-muted) mb-3 leading-relaxed">
                          You need to set up FHE ciphertext guardrails before
                          submitting a confidential proposal.
                        </p>
                        <Link
                          href={`/dashboard/treasuries/${pda}/guardrails`}
                          onClick={onClose}
                          className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-widest text-(--warning-text) hover:underline"
                        >
                          <Lock className="size-3" animateOnHover />
                          Configure Guardrails
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-sm border border-white/8 bg-white/4 p-4 text-sm text-zinc-300">
                      Submit through the backend signer, then use the{" "}
                      <span className="font-mono text-white">Lifecycle</span>{" "}
                      button in Pending Proposals to complete decryption and
                      execution.
                    </div>
                  ))}

                {entry && (
                  <p className="text-[11px] text-(--text-muted) font-mono">
                    {entry.account.aiAuthority?.toString?.() ===
                    wallet.publicKey?.toBase58()
                      ? "Signing with connected wallet"
                      : `Signing via backend agent ${selectedAgent?.agentId ?? "not selected"}`}
                  </p>
                )}
              </form>

              {showPreview && <PolicyPreview preview={preview} />}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
