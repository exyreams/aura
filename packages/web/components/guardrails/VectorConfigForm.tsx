"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Skeleton } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface VectorConfigFormProps {
  account?: TreasuryEntry["account"];
  pda?: string;
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
  vectorCiphertext: string;
  setVectorCiphertext: Dispatch<SetStateAction<string>>;
  encryptVectorMutation: UseMutationResult<
    { guardrailVectorCiphertext: string },
    Error,
    void,
    unknown
  >;
  vectorMutation: UseMutationResult<string, Error, void, unknown>;
}

export function VectorConfigForm({
  account,
  pda,
  plaintextForm,
  setPlaintextForm,
  vectorCiphertext,
  encryptVectorMutation,
  vectorMutation,
}: VectorConfigFormProps) {
  const hasExisting =
    !!account?.confidentialGuardrails?.guardrailVectorCiphertext;
  const isEncrypting = encryptVectorMutation.isPending;

  const dailyLimitDisplay = formatCurrency(
    Number(plaintextForm.dailyLimit) / 100,
  );
  const perTxLimitDisplay = formatCurrency(
    Number(plaintextForm.perTxLimit) / 100,
  );
  const spentTodayDisplay = formatCurrency(
    Number(plaintextForm.spentToday) / 100,
  );

  return (
    <>
      {/* Known issue banner */}
      <div className="mb-6 flex gap-3 p-4 rounded-sm border border-(--warning-border) bg-(--warning-bg)">
        <AlertTriangle className="w-4 h-4 text-(--warning-text) shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-(--warning-text) mb-1">
            Vector proposals have a known on-chain issue
          </p>
          <p className="text-[11px] text-(--text-muted) leading-relaxed">
            The vector proposal instruction hits the BPF heap limit during FHE
            execution. Configuration here will succeed, but confidential
            proposals will fail. Use{" "}
            <span className="text-(--text-main) font-semibold">
              Scalar Mode
            </span>{" "}
            until this is resolved.
          </p>
        </div>
      </div>

      <Card className="mb-4 p-6" hover={false}>
        <div className="mb-6">
          <h2 className="text-lg font-bold text-(--text-main) mb-1">
            Vector Configuration
          </h2>
          <p className="text-sm text-(--text-muted)">
            Encrypts all three policy values into a single vector ciphertext,
            then submits the owner-signed guardrail config.
          </p>
        </div>

        {/* Editable plaintext values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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

        {pda && (
          <p className="text-[10px] text-(--text-muted) mb-6">
            Values default from your policy config.{" "}
            <Link
              href={`/dashboard/treasuries/${pda}`}
              className="text-(--text-main) hover:underline"
            >
              Back to treasury →
            </Link>
          </p>
        )}

        {/* Step 1: Encrypt */}
        <div className="mb-6 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mono text-[9px] text-(--text-muted) font-bold shrink-0">
              1
            </span>
            <span className="text-xs font-semibold text-(--text-main)">
              Generate vector ciphertext
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-4">
            <div className="flex gap-1">
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main)">
                {dailyLimitDisplay}
              </div>
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main)">
                {perTxLimitDisplay}
              </div>
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main)">
                {spentTodayDisplay}
              </div>
            </div>
            <ArrowRight className="text-slate-600 hidden md:block shrink-0" />
            <div className="px-4 py-3 bg-white/2 border border-white/10 border-dashed rounded text-(--text-muted) mono text-xs italic">
              Single vector ciphertext
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => encryptVectorMutation.mutate()}
            loading={isEncrypting}
          >
            {hasExisting ? "Re-encrypt Vector Values" : "Encrypt Vector Values"}
          </Button>

          {encryptVectorMutation.error && (
            <div className="mt-3 rounded-sm border border-danger/20 bg-danger/10 p-3">
              <p className="text-xs font-semibold text-danger mb-1">
                Encryption failed
              </p>
              <p className="text-xs text-danger/80 break-all">
                {encryptVectorMutation.error.message}
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Submit */}
        <div className="pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mono text-[9px] text-(--text-muted) font-bold shrink-0">
              2
            </span>
            <span className="text-xs font-semibold text-(--text-main)">
              Submit to treasury
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="vector-ciphertext"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-2"
              >
                Vector ciphertext
              </label>
              {isEncrypting ? (
                <Skeleton className="h-10 w-full rounded-sm" />
              ) : (
                <div className="w-full bg-(--input-bg) border border-border rounded-sm px-4 py-3 mono text-xs text-(--text-main) opacity-70 cursor-not-allowed truncate min-h-[42px]">
                  {vectorCiphertext || (
                    <span className="text-(--text-muted) italic">
                      Click &quot;{hasExisting ? "Re-encrypt" : "Encrypt"}{" "}
                      Vector Values&quot; to generate
                    </span>
                  )}
                </div>
              )}
            </div>

            {encryptVectorMutation.isSuccess && !isEncrypting && (
              <div className="flex items-center gap-2 text-xs text-active font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Ciphertext generated
              </div>
            )}

            <Button
              variant="primary"
              className="w-full font-mono tracking-widest text-xs"
              loading={vectorMutation.isPending}
              onClick={() => vectorMutation.mutate()}
              disabled={!vectorCiphertext || isEncrypting}
            >
              {hasExisting
                ? "Update Vector Guardrails"
                : "Configure Vector Guardrails"}
            </Button>

            {vectorMutation.error && (
              <div className="rounded-sm border border-danger/20 bg-danger/10 p-3">
                <p className="text-xs text-danger break-all">
                  {vectorMutation.error.message}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Success banner — below card */}
      {vectorMutation.isSuccess && (
        <div className="mb-10 flex items-center gap-3 p-4 rounded-sm border border-(--success-border) bg-(--success-bg)">
          <CheckCircle2 className="w-4 h-4 text-(--success-text) shrink-0" />
          <div>
            <p className="text-xs font-semibold text-(--success-text)">
              {hasExisting
                ? "Vector guardrails updated on-chain"
                : "Vector guardrails configured on-chain"}
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
