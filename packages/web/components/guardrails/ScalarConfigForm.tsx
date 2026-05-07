"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { CheckCircle2, Lock } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Skeleton } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
import type { TreasuryEntry } from "@/lib/hooks";

interface ScalarConfigFormProps {
  account?: TreasuryEntry["account"];
  plaintextForm: {
    dailyLimit: string;
    perTxLimit: string;
    spentToday: string;
  };
  setPlaintextForm: Dispatch<
    SetStateAction<{
      dailyLimit: string;
      perTxLimit: string;
      spentToday: string;
    }>
  >;
  scalarForm: {
    dailyLimitCiphertext: string;
    perTxLimitCiphertext: string;
    spentTodayCiphertext: string;
  };
  setScalarForm: Dispatch<
    SetStateAction<{
      dailyLimitCiphertext: string;
      perTxLimitCiphertext: string;
      spentTodayCiphertext: string;
    }>
  >;
  encryptScalarMutation: UseMutationResult<
    {
      dailyLimitCiphertext: string;
      perTxLimitCiphertext: string;
      spentTodayCiphertext: string;
    },
    Error,
    void,
    unknown
  >;
  scalarMutation: UseMutationResult<string, Error, void, unknown>;
  backendInfo?: { auth?: { mode: string } };
  selectedAgentPublicKey?: string;
  ensureDepositMutation: UseMutationResult<
    {
      created: boolean;
      signature?: string;
      accounts: Record<string, string>;
    },
    Error,
    void,
    unknown
  >;
  allCiphertextsExist?: boolean;
  ciphertextExistence?: Array<{
    addr: string;
    exists: boolean;
    dataLen: number;
  }>;
}

export function ScalarConfigForm({
  account,
  plaintextForm,
  setPlaintextForm,
  scalarForm,
  encryptScalarMutation,
  scalarMutation,
  backendInfo,
  selectedAgentPublicKey,
  ensureDepositMutation,
}: ScalarConfigFormProps) {
  const hasExisting = !!account?.confidentialGuardrails?.dailyLimitCiphertext;
  const isEncrypting = encryptScalarMutation.isPending;

  const canSubmitScalar = Boolean(
    scalarForm.dailyLimitCiphertext &&
      scalarForm.perTxLimitCiphertext &&
      scalarForm.spentTodayCiphertext,
  );

  const depositAlreadyExists = ensureDepositMutation.data?.created === false;

  const ciphertextFields = [
    { label: "Daily limit ciphertext", key: "dailyLimitCiphertext" as const },
    { label: "Per-tx ciphertext", key: "perTxLimitCiphertext" as const },
    { label: "Spent today ciphertext", key: "spentTodayCiphertext" as const },
  ];

  return (
    <>
      <Card className="mb-4 p-6" hover={false}>
        <div className="mb-8">
          <h2 className="text-lg font-bold text-(--text-main) mb-1">
            Scalar Configuration
          </h2>
          <p className="text-sm text-(--text-muted)">
            Convert plaintext policy values to ciphertext accounts through the
            backend, then submit the owner-signed guardrail config.
          </p>
        </div>

        {/* FHE Orchestration — inline prereq */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-sm border border-white/8 bg-white/4">
            <div className="text-sm text-slate-300 min-w-0">
              <span className="text-[10px] mono uppercase text-(--text-muted) font-bold block mb-0.5">
                FHE Orchestration
              </span>
              <span className="mono text-xs text-white break-all">
                {selectedAgentPublicKey ??
                  backendInfo?.auth?.mode ??
                  "No agent selected"}
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => ensureDepositMutation.mutate()}
              loading={ensureDepositMutation.isPending}
              disabled={
                !selectedAgentPublicKey || ensureDepositMutation.isPending
              }
              className="shrink-0"
            >
              {depositAlreadyExists
                ? "Update Encrypt Deposit"
                : "Ensure Encrypt Deposit"}
            </Button>
          </div>
          {ensureDepositMutation.data && (
            <p className="mono text-[11px] text-(--text-muted) mt-2 px-1 break-all">
              deposit:{" "}
              <span className="text-(--text-main)">
                {ensureDepositMutation.data.accounts.deposit}
              </span>
            </p>
          )}
        </div>

        {/* Plaintext inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <UsdInput
            label="Daily limit"
            valueCents={plaintextForm.dailyLimit}
            onChangeCents={(v) =>
              setPlaintextForm((current) => ({ ...current, dailyLimit: v }))
            }
          />
          <UsdInput
            label="Per-tx limit"
            valueCents={plaintextForm.perTxLimit}
            onChangeCents={(v) =>
              setPlaintextForm((current) => ({ ...current, perTxLimit: v }))
            }
          />
          <UsdInput
            label="Spent today"
            valueCents={plaintextForm.spentToday}
            onChangeCents={(v) =>
              setPlaintextForm((current) => ({ ...current, spentToday: v }))
            }
          />
        </div>

        <Button
          variant="secondary"
          className="mb-6"
          onClick={() => encryptScalarMutation.mutate()}
          loading={isEncrypting}
        >
          {hasExisting
            ? "Re-encrypt Plaintext Values"
            : "Encrypt Plaintext Values"}
        </Button>

        {/* Ciphertext address fields — read-only, skeleton while encrypting */}
        <div className="grid grid-cols-1 gap-4 mb-8">
          {ciphertextFields.map(({ label, key }) => (
            <div key={key} className="space-y-1.5">
              <label className="mono text-[10px] uppercase text-(--text-muted) font-bold block">
                {label}
              </label>
              {isEncrypting ? (
                <Skeleton className="h-10 w-full rounded-sm" />
              ) : (
                <div className="w-full bg-(--input-bg) border border-border rounded-sm px-4 py-3 mono text-xs text-(--text-main) opacity-70 cursor-not-allowed truncate min-h-[42px]">
                  {scalarForm[key] || (
                    <span className="text-(--text-muted) italic">
                      Click &quot;{hasExisting ? "Re-encrypt" : "Encrypt"}{" "}
                      Plaintext Values&quot; to generate
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {encryptScalarMutation.error && (
          <div className="mb-6 rounded-sm border border-danger/20 bg-danger/10 p-3">
            <p className="text-xs font-semibold text-danger mb-1">
              Encryption failed
            </p>
            <p className="text-xs text-danger/80 break-all">
              {encryptScalarMutation.error.message}
            </p>
          </div>
        )}

        <div className="flex items-center gap-4 p-4 bg-white/2 border border-white/5 rounded-lg mb-8 group">
          <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center shrink-0 border border-white/5">
            <Lock className="w-5 h-5 text-(--text-muted) group-hover:text-(--text-main) transition-colors" />
          </div>
          <div>
            <span className="text-xs text-(--text-main) font-medium block">
              FHE Privacy Guard
            </span>
            <p className="text-[11px] text-(--text-muted)">
              Values will be encrypted via Ika Encrypt network before on-chain
              submission.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 pt-6 border-t border-white/5">
          <Button
            variant="primary"
            className="min-w-[200px]"
            loading={scalarMutation.isPending}
            onClick={() => scalarMutation.mutate()}
            disabled={!canSubmitScalar}
          >
            {hasExisting
              ? "Update Scalar Guardrails"
              : "Configure Scalar Guardrails"}
          </Button>
        </div>

        {scalarMutation.error && (
          <div className="mt-4 rounded-sm border border-danger/20 bg-danger/10 p-4">
            <p className="text-xs font-semibold text-danger mb-1">
              Transaction failed
            </p>
            <p className="text-xs text-danger/80 break-all">
              {scalarMutation.error.message}
            </p>
            {(scalarMutation.error as { logs?: string[] }).logs?.length ? (
              <details className="mt-2">
                <summary className="text-[10px] mono text-danger/60 cursor-pointer">
                  Show logs
                </summary>
                <pre className="mt-2 text-[10px] mono text-danger/60 whitespace-pre-wrap break-all">
                  {(scalarMutation.error as { logs?: string[] }).logs?.join(
                    "\n",
                  )}
                </pre>
              </details>
            ) : null}
          </div>
        )}
      </Card>

      {/* Success banner — below card */}
      {scalarMutation.isSuccess && (
        <div className="mb-10 flex items-center gap-3 p-4 rounded-sm border border-(--success-border) bg-(--success-bg)">
          <CheckCircle2 className="w-4 h-4 text-(--success-text) shrink-0" />
          <div>
            <p className="text-xs font-semibold text-(--success-text)">
              {hasExisting
                ? "Scalar guardrails updated on-chain"
                : "Scalar guardrails configured on-chain"}
            </p>
            <p className="text-[11px] text-(--text-muted) mt-0.5">
              The treasury now enforces FHE-encrypted spending limits.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
