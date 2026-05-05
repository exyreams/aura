"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Input } from "@/components/global";
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
  backendUrl: string;
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
}

export function ScalarConfigForm({
  plaintextForm,
  setPlaintextForm,
  scalarForm,
  setScalarForm,
  encryptScalarMutation,
  scalarMutation,
  backendUrl,
  backendInfo,
  selectedAgentPublicKey,
  ensureDepositMutation,
}: ScalarConfigFormProps) {
  const canSubmitScalar = Boolean(
    scalarForm.dailyLimitCiphertext &&
      scalarForm.perTxLimitCiphertext &&
      scalarForm.spentTodayCiphertext,
  );

  return (
    <>
      <Card className="mb-10 p-6" hover={false}>
        <div className="mb-8">
          <h2 className="text-lg font-bold text-(--text-main) mb-1">
            Backend Service
          </h2>
          <p className="text-sm text-(--text-muted)">
            The backend pays for Encrypt deposit setup and confidential
            execution orchestration.
          </p>
        </div>

        <div className="space-y-4 rounded-[1.3rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
          <p>
            Backend URL: <span className="text-white">{backendUrl}</span>
          </p>
          <p>
            Selected agent signer:{" "}
            <span className="mono text-white">
              {selectedAgentPublicKey ??
                backendInfo?.auth?.mode ??
                "No agent selected"}
            </span>
          </p>
          <Button
            variant="secondary"
            onClick={() => ensureDepositMutation.mutate()}
            loading={ensureDepositMutation.isPending}
            disabled={
              !selectedAgentPublicKey || ensureDepositMutation.isPending
            }
          >
            Ensure Encrypt Deposit
          </Button>
          {ensureDepositMutation.data && (
            <p className="mono text-xs text-slate-200">
              deposit: {ensureDepositMutation.data.accounts.deposit}
            </p>
          )}
        </div>
      </Card>

      <Card className="mb-10 p-6" hover={false}>
        <div className="mb-8">
          <h2 className="text-lg font-bold text-(--text-main) mb-1">
            Scalar Configuration
          </h2>
          <p className="text-sm text-(--text-muted)">
            Convert plaintext policy values to ciphertext accounts through the
            backend, then submit the owner-signed guardrail config.
          </p>
        </div>

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
          loading={encryptScalarMutation.isPending}
        >
          Encrypt Plaintext Values
        </Button>

        <div className="grid grid-cols-1 gap-6 mb-8">
          {[
            ["Daily limit ciphertext", "dailyLimitCiphertext"],
            ["Per-tx ciphertext", "perTxLimitCiphertext"],
            ["Spent today ciphertext", "spentTodayCiphertext"],
          ].map(([label, key]) => (
            <div key={key} className="space-y-2">
              <label
                htmlFor={key}
                className="mono text-[10px] uppercase text-(--text-muted) font-bold"
              >
                {label}
              </label>
              <Input
                id={key}
                className="mono text-xs"
                value={scalarForm[key as keyof typeof scalarForm]}
                onChange={(e) =>
                  setScalarForm((current) => ({
                    ...current,
                    [key]: e.target.value,
                  }))
                }
                placeholder="Ciphertext public key..."
              />
            </div>
          ))}
        </div>

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
            Configure Scalar Guardrails
          </Button>
          {scalarMutation.error && (
            <div className="text-xs text-danger">
              {scalarMutation.error.message}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
