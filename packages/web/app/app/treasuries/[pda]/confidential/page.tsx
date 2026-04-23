"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader, StatusPill, Surface } from "@/components/app/ui";
import {
  CHAINS,
  parsePublicKey,
  sendWalletInstructions,
  TX_TYPES,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import {
  useAppSettings,
  useAuraClient,
  useBackendInfo,
  useTreasury,
} from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

const initialProposalForm = {
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

export default function ConfidentialPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const backendInfoQuery = useBackendInfo();
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
  const [plaintextForm, setPlaintextForm] = useState({
    dailyLimit: account?.policyConfig.dailyLimitUsd.toString() ?? "15000",
    perTxLimit: account?.policyConfig.perTxLimitUsd.toString() ?? "5000",
    spentToday: account?.policyState.spentTodayUsd.toString() ?? "0",
  });
  const [vectorCiphertext, setVectorCiphertext] = useState(
    account?.confidentialGuardrails?.guardrailVectorCiphertext?.toBase58() ??
      "",
  );
  const [proposalForm, setProposalForm] = useState(initialProposalForm);
  const [lifecycleState, setLifecycleState] = useState({
    policyOutputCiphertext:
      account?.pending?.policyOutputCiphertextAccount?.toString() ?? "",
    requestAccount:
      account?.pending?.decryptionRequest?.requestAccount?.toString() ?? "",
    messageApproval:
      account?.pending?.signatureRequest?.messageApprovalAccount?.toString() ??
      "",
  });
  const canSubmitScalar = Boolean(
    wallet.publicKey &&
      entry &&
      scalarForm.dailyLimitCiphertext &&
      scalarForm.perTxLimitCiphertext &&
      scalarForm.spentTodayCiphertext,
  );
  const canSubmitVector = Boolean(
    wallet.publicKey && entry && vectorCiphertext,
  );
  const canRequestDecryption = Boolean(
    lifecycleState.policyOutputCiphertext ||
      account?.pending?.policyOutputCiphertextAccount,
  );
  const canConfirmDecryption = Boolean(
    lifecycleState.requestAccount ||
      account?.pending?.decryptionRequest?.requestAccount,
  );
  const canExecutePending = Boolean(account?.pending);
  const canFinalize = Boolean(
    lifecycleState.messageApproval ||
      account?.pending?.signatureRequest?.messageApprovalAccount,
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
    setLifecycleState({
      policyOutputCiphertext:
        account.pending?.policyOutputCiphertextAccount?.toString() ?? "",
      requestAccount:
        account.pending?.decryptionRequest?.requestAccount?.toString() ?? "",
      messageApproval:
        account.pending?.signatureRequest?.messageApprovalAccount?.toString() ??
        "",
    });
  }, [account]);

  const ensureDepositMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        created: boolean;
        signature?: string;
        accounts: Record<string, string>;
      }>(settings.backendUrl, "/v1/confidential/deposit/ensure", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
      }),
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

  const proposeMutation = useMutation({
    mutationFn: async () =>
      postBackend<{
        signature: string;
        amountCiphertext: string;
        policyOutputCiphertext: string;
        deposit: string;
      }>(settings.backendUrl, "/v1/confidential/propose", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        treasury: pda,
        amountUsd: Number(proposalForm.amountUsd),
        chain: Number(proposalForm.chain),
        txType: Number(proposalForm.txType),
        recipient: proposalForm.recipient,
        protocolId: proposalForm.protocolId
          ? Number(proposalForm.protocolId)
          : undefined,
        expectedOutputUsd: proposalForm.expectedOutputUsd
          ? Number(proposalForm.expectedOutputUsd)
          : undefined,
        actualOutputUsd: proposalForm.actualOutputUsd
          ? Number(proposalForm.actualOutputUsd)
          : undefined,
        quoteAgeSecs: proposalForm.quoteAgeSecs
          ? Number(proposalForm.quoteAgeSecs)
          : undefined,
        counterpartyRiskScore: proposalForm.counterpartyRiskScore
          ? Number(proposalForm.counterpartyRiskScore)
          : undefined,
        waitForOutput: true,
      }),
    onSuccess: async (result) => {
      setLifecycleState((current) => ({
        ...current,
        policyOutputCiphertext: result.policyOutputCiphertext,
      }));
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Confidential Setup"
        title="Run the confidential execution flow."
        copy={`This screen now drives the backend-assisted Encrypt + dWallet lifecycle for ${shortenAddress(pda, 8, 8)} while leaving owner-only guardrail configuration in the connected wallet.`}
        action={<StatusPill status={account?.pending ? "Pending" : "Active"} />}
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

        <Surface
          title="Backend Service"
          copy="The backend pays for Encrypt deposit setup and confidential execution orchestration."
        >
          <div className="space-y-4 rounded-[1.3rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
            <p>
              Backend URL:{" "}
              <span className="text-white">{settings.backendUrl}</span>
            </p>
            <p>
              Backend signer:{" "}
              <span className="mono text-white">
                {backendInfoQuery.data?.publicKey ??
                  (backendInfoQuery.isError ? "Unavailable" : "Loading")}
              </span>
            </p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => ensureDepositMutation.mutate()}
              disabled={ensureDepositMutation.isPending}
            >
              {ensureDepositMutation.isPending
                ? "Ensuring deposit..."
                : "Ensure Encrypt Deposit"}
            </button>
            {ensureDepositMutation.data ? (
              <p className="mono text-xs text-slate-200">
                deposit: {ensureDepositMutation.data.accounts.deposit}
              </p>
            ) : null}
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface
          title="Encrypt Scalar Guardrails"
          copy="Convert plaintext policy values to ciphertext accounts through the backend, then submit the owner-signed guardrail config."
        >
          <div className="grid gap-4">
            {[
              ["Daily limit plaintext", "dailyLimit"],
              ["Per-tx plaintext", "perTxLimit"],
              ["Spent today plaintext", "spentToday"],
            ].map(([label, key]) => (
              <label key={key}>
                <span className="field-label">{label}</span>
                <input
                  className="input"
                  value={plaintextForm[key as keyof typeof plaintextForm]}
                  onChange={(event) =>
                    setPlaintextForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="button-secondary"
              onClick={() => encryptScalarMutation.mutate()}
              disabled={encryptScalarMutation.isPending}
            >
              {encryptScalarMutation.isPending
                ? "Encrypting..."
                : "Encrypt Plaintext Values"}
            </button>
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
              disabled={scalarMutation.isPending || !canSubmitScalar}
            >
              {scalarMutation.isPending
                ? "Submitting..."
                : "Configure Scalar Guardrails"}
            </button>
          </div>
        </Surface>

        <Surface
          title="Vector Guardrails"
          copy="If you already have a guardrail vector ciphertext account, submit it here with the owner wallet."
        >
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
              disabled={vectorMutation.isPending || !canSubmitVector}
            >
              {vectorMutation.isPending
                ? "Submitting..."
                : "Submit Vector Ciphertext"}
            </button>
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface
          title="Submit Confidential Proposal"
          copy="This uses the backend signer to create ciphertexts, submit the confidential proposal instruction, and persist the policy output account."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Amount (USD cents)</span>
              <input
                className="input"
                value={proposalForm.amountUsd}
                onChange={(event) =>
                  setProposalForm((current) => ({
                    ...current,
                    amountUsd: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="field-label">Target chain</span>
              <select
                className="select"
                value={proposalForm.chain}
                onChange={(event) =>
                  setProposalForm((current) => ({
                    ...current,
                    chain: event.target.value,
                  }))
                }
              >
                {CHAINS.map((chain) => (
                  <option key={chain.code} value={chain.code}>
                    {chain.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Transaction type</span>
              <select
                className="select"
                value={proposalForm.txType}
                onChange={(event) =>
                  setProposalForm((current) => ({
                    ...current,
                    txType: event.target.value,
                  }))
                }
              >
                {TX_TYPES.map((txType) => (
                  <option key={txType.code} value={txType.code}>
                    {txType.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Recipient / contract</span>
              <input
                className="input"
                value={proposalForm.recipient}
                onChange={(event) =>
                  setProposalForm((current) => ({
                    ...current,
                    recipient: event.target.value,
                  }))
                }
                placeholder="Destination address or contract"
              />
            </label>
            {[
              ["Protocol ID", "protocolId"],
              ["Expected output", "expectedOutputUsd"],
              ["Actual output", "actualOutputUsd"],
              ["Quote age", "quoteAgeSecs"],
              ["Counterparty risk", "counterpartyRiskScore"],
            ].map(([label, key]) => (
              <label key={key}>
                <span className="field-label">{label}</span>
                <input
                  className="input"
                  value={proposalForm[key as keyof typeof proposalForm]}
                  onChange={(event) =>
                    setProposalForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <div className="md:col-span-2">
              <button
                type="button"
                className="button-primary"
                onClick={() => proposeMutation.mutate()}
                disabled={proposeMutation.isPending || !proposalForm.recipient}
              >
                {proposeMutation.isPending
                  ? "Submitting..."
                  : "Submit Confidential Proposal"}
              </button>
            </div>
          </div>
        </Surface>

        <Surface
          title="Pending Lifecycle"
          copy="Drive decryption, execution, and finalize using the backend worker signer."
        >
          <div className="space-y-4">
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300">
              <p className="mono">
                policy_output: {lifecycleState.policyOutputCiphertext || "n/a"}
              </p>
              <p className="mono">
                request_account: {lifecycleState.requestAccount || "n/a"}
              </p>
              <p className="mono">
                message_approval: {lifecycleState.messageApproval || "n/a"}
              </p>
              <p>
                pending approved:{" "}
                <span className="text-white">
                  {account?.pending
                    ? String(account.pending.decision.approved)
                    : "n/a"}
                </span>
              </p>
            </div>
            <button
              type="button"
              className="button-secondary"
              onClick={() => requestDecryptionMutation.mutate()}
              disabled={
                requestDecryptionMutation.isPending || !canRequestDecryption
              }
            >
              {requestDecryptionMutation.isPending
                ? "Requesting..."
                : "Request Policy Decryption"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => confirmDecryptionMutation.mutate()}
              disabled={
                confirmDecryptionMutation.isPending || !canConfirmDecryption
              }
            >
              {confirmDecryptionMutation.isPending
                ? "Confirming..."
                : "Confirm Policy Decryption"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || !canExecutePending}
            >
              {executeMutation.isPending ? "Executing..." : "Execute Pending"}
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending || !canFinalize}
            >
              {finalizeMutation.isPending
                ? "Finalizing..."
                : "Finalize Execution"}
            </button>
          </div>
        </Surface>
      </div>

      <Surface title="Latest Result">
        <div className="space-y-3 text-sm text-slate-300">
          {[
            ensureDepositMutation,
            encryptScalarMutation,
            scalarMutation,
            vectorMutation,
            proposeMutation,
            requestDecryptionMutation,
            confirmDecryptionMutation,
            executeMutation,
            finalizeMutation,
          ]
            .map((mutation) =>
              mutation.error instanceof Error ? mutation.error.message : null,
            )
            .filter(Boolean)
            .map((message) => (
              <div
                key={message}
                className="rounded-[1.2rem] border border-rose-400/16 bg-rose-400/10 p-4 text-slate-200"
              >
                {message}
              </div>
            ))}

          {!ensureDepositMutation.data &&
          !proposeMutation.data &&
          !confirmDecryptionMutation.data &&
          !executeMutation.data &&
          !finalizeMutation.data ? (
            <p className="text-slate-400">
              No backend lifecycle action has completed yet.
            </p>
          ) : null}

          {ensureDepositMutation.data ? (
            <div className="rounded-[1.2rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
              Encrypt deposit ready. Created:{" "}
              <span className="text-white">
                {String(ensureDepositMutation.data.created)}
              </span>
            </div>
          ) : null}

          {proposeMutation.data ? (
            <div className="rounded-[1.2rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
              Confidential proposal submitted. Signature{" "}
              <span className="mono text-white">
                {proposeMutation.data.signature}
              </span>
            </div>
          ) : null}

          {confirmDecryptionMutation.data ? (
            <div className="rounded-[1.2rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
              Decryption confirmed. Approved:{" "}
              <span className="text-white">
                {String(confirmDecryptionMutation.data.approved)}
              </span>
              {confirmDecryptionMutation.data.violationCode ? (
                <p className="mt-2 text-sm text-slate-100">
                  Violation code:{" "}
                  <span className="mono text-white">
                    {confirmDecryptionMutation.data.violationCode}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {executeMutation.data ? (
            <div className="rounded-[1.2rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
              Execute submitted. Signature{" "}
              <span className="mono text-white">
                {executeMutation.data.signature}
              </span>
              <p className="mt-2 text-sm text-slate-100">
                Approved decision:{" "}
                <span className="text-white">
                  {String(executeMutation.data.approved)}
                </span>
              </p>
            </div>
          ) : null}

          {finalizeMutation.data ? (
            <div className="rounded-[1.2rem] border border-emerald-400/16 bg-emerald-400/10 p-4">
              Finalize submitted. Signature{" "}
              <span className="mono text-white">
                {finalizeMutation.data.signature}
              </span>
              <p className="mt-2 text-sm text-slate-100">
                Total transactions:{" "}
                <span className="text-white">
                  {finalizeMutation.data.totalTransactions}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
