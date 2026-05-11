"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Badge } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { Tooltip } from "@/components/global/Tooltip";
import { UsdInput } from "@/components/global/UsdInput";
import {
  Checkcircle,
  Copy,
  RefreshCw,
  Send,
  SquareArrowOutUpRight,
} from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface ScalarConfigFormProps {
  account?: TreasuryEntry["account"];
  plaintextForm: { dailyLimit: string; perTxLimit: string; spentToday: string };
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
    { created: boolean; signature?: string; accounts: Record<string, string> },
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
  network?: string;
}

// Copy button with flash
function CopyBtn({ value, size = 11 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied!" : "Copy"}>
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-(--text-muted) hover:text-primary transition-colors shrink-0"
      >
        {copied ? (
          <Checkcircle size={size} animateOnHover className="text-success" />
        ) : (
          <Copy size={size} animateOnHover />
        )}
      </button>
    </Tooltip>
  );
}

function CiphertextRow({
  label,
  value,
  isLoading,
  network,
}: {
  label: string;
  value: string;
  isLoading?: boolean;
  network: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-3">
        <span className="mono text-[10px] uppercase tracking-wider text-(--text-muted) shrink-0">
          {label}
        </span>
        <Skeleton className="h-3 w-48" />
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
        <span className="mono text-[10px] uppercase tracking-wider text-(--text-muted)">
          {label}
        </span>
        <span className="mono text-[10px] text-(--text-muted) italic">
          not set
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <span className="mono text-[10px] uppercase tracking-wider text-(--text-muted)">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <Tooltip content={value}>
          <span className="mono text-[11px] text-(--text-main)">
            <span className="hidden lg:inline">{value}</span>
            <span className="lg:hidden">{shortenAddress(value, 8, 6)}</span>
          </span>
        </Tooltip>
        <CopyBtn value={value} />
        <Tooltip content="View on Explorer">
          <a
            href={`https://explorer.solana.com/address/${value}?cluster=${network}`}
            target="_blank"
            rel="noreferrer"
            className="text-(--text-muted) hover:text-primary transition-colors shrink-0"
          >
            <SquareArrowOutUpRight size={11} animateOnHover />
          </a>
        </Tooltip>
      </div>
    </div>
  );
}

// Step number circle — visible with proper bg
function StepNum({ n, done }: { n: number; done?: boolean }) {
  return done ? (
    <Checkcircle size={18} animateOnHover className="text-success shrink-0" />
  ) : (
    <div className="size-6 rounded-full bg-(--card-bg) border border-border flex items-center justify-center shrink-0">
      <span className="mono text-[10px] font-bold text-(--text-main)">{n}</span>
    </div>
  );
}

export function ScalarConfigForm({
  account,
  plaintextForm,
  setPlaintextForm,
  scalarForm,
  encryptScalarMutation,
  scalarMutation,
  selectedAgentPublicKey,
  ensureDepositMutation,
  network = "devnet",
}: ScalarConfigFormProps) {
  const hasExisting = !!account?.confidentialGuardrails?.dailyLimitCiphertext;
  const isEncrypting = encryptScalarMutation.isPending;
  const canSubmitScalar = Boolean(
    scalarForm.dailyLimitCiphertext &&
      scalarForm.perTxLimitCiphertext &&
      scalarForm.spentTodayCiphertext,
  );

  const ciphertextRows = [
    { label: "Daily limit", key: "dailyLimitCiphertext" as const },
    { label: "Per-tx limit", key: "perTxLimitCiphertext" as const },
    { label: "Spent today", key: "spentTodayCiphertext" as const },
  ];

  return (
    <div className="space-y-4">
      {/* Current on-chain state — only when configured */}
      {hasExisting && (
        <div className="border border-border rounded-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-(--card-content)/60 border-b border-border">
            <span className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
              Current On-Chain State
            </span>
            <Badge variant="active" className="text-[9px] px-2 py-0.5">
              Scalar FHE Active
            </Badge>
          </div>
          <div className="px-4 py-1">
            {ciphertextRows.map(({ label, key }) => (
              <CiphertextRow
                key={key}
                label={label}
                value={
                  account?.confidentialGuardrails?.[
                    key as keyof typeof account.confidentialGuardrails
                  ]?.toBase58?.() ?? ""
                }
                network={network}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 1 — Ensure Deposit */}
      <div className="border border-border rounded-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-(--card-content)/60 border-b border-border">
          <StepNum n={1} done={ensureDepositMutation.isSuccess} />
          <div className="flex-1 min-w-0">
            <span className="mono text-[11px] font-semibold text-(--text-main) block">
              Ensure Encrypt Deposit
            </span>
            <p className="text-[11px] text-(--text-muted) mt-0.5">
              Fund the Ika Encrypt deposit account for the selected agent.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Agent
            </span>
            {selectedAgentPublicKey ? (
              <div className="flex items-center gap-1.5">
                <span className="mono text-[11px] text-(--text-main)">
                  <span className="hidden lg:inline">
                    {selectedAgentPublicKey}
                  </span>
                  <span className="lg:hidden">
                    {shortenAddress(selectedAgentPublicKey, 8, 6)}
                  </span>
                </span>
                <CopyBtn value={selectedAgentPublicKey} />
              </div>
            ) : (
              <span className="mono text-[11px] text-(--text-muted) italic">
                No agent selected
              </span>
            )}
            {/* Deposit account — skeleton while syncing, address when done */}
            {(ensureDepositMutation.isPending ||
              ensureDepositMutation.data?.accounts.deposit) && (
              <div className="mt-2">
                <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
                  Deposit Account
                </span>
                {ensureDepositMutation.isPending ? (
                  <Skeleton className="h-3 w-64 mt-1" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="mono text-[11px] text-(--text-main)">
                      <span className="hidden lg:inline">
                        {ensureDepositMutation.data?.accounts.deposit}
                      </span>
                      <span className="lg:hidden">
                        {shortenAddress(
                          ensureDepositMutation.data?.accounts.deposit,
                          8,
                          6,
                        )}
                      </span>
                    </span>
                    <CopyBtn
                      value={ensureDepositMutation.data?.accounts.deposit}
                    />
                    <Tooltip content="View on Explorer">
                      <a
                        href={`https://explorer.solana.com/address/${ensureDepositMutation.data?.accounts.deposit}?cluster=${network}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-(--text-muted) hover:text-primary transition-colors"
                      >
                        <SquareArrowOutUpRight size={11} animateOnHover />
                      </a>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => ensureDepositMutation.mutate()}
            loading={ensureDepositMutation.isPending}
            disabled={
              !selectedAgentPublicKey || ensureDepositMutation.isPending
            }
            className="shrink-0"
          >
            Sync Deposit
          </Button>
        </div>
        {ensureDepositMutation.error && (
          <div className="px-4 pb-3">
            <Alert
              variant="error"
              message={ensureDepositMutation.error.message}
            />
          </div>
        )}
      </div>

      {/* Step 2 — Encrypt Values */}
      <div className="border border-border rounded-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-(--card-content)/60 border-b border-border">
          <StepNum n={2} done={canSubmitScalar && !isEncrypting} />
          <div className="flex-1 min-w-0">
            <span className="mono text-[11px] font-semibold text-(--text-main) block">
              Encrypt Plaintext Values
            </span>
            <p className="text-[11px] text-(--text-muted) mt-0.5">
              Convert USD limits to FHE ciphertexts via the Ika Encrypt network.
            </p>
          </div>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UsdInput
              label="Daily limit"
              valueCents={plaintextForm.dailyLimit}
              onChangeCents={(v) =>
                setPlaintextForm((c) => ({ ...c, dailyLimit: v }))
              }
            />
            <UsdInput
              label="Per-tx limit"
              valueCents={plaintextForm.perTxLimit}
              onChangeCents={(v) =>
                setPlaintextForm((c) => ({ ...c, perTxLimit: v }))
              }
            />
            <UsdInput
              label="Spent today"
              valueCents={plaintextForm.spentToday}
              onChangeCents={(v) =>
                setPlaintextForm((c) => ({ ...c, spentToday: v }))
              }
            />
          </div>

          <Button
            variant="secondary"
            size="small"
            icon={<RefreshCw size={13} animateOnHover />}
            onClick={() => encryptScalarMutation.mutate()}
            loading={isEncrypting}
          >
            {hasExisting ? "Re-encrypt Values" : "Encrypt Values"}
          </Button>

          {/* Ciphertext output — show when encrypting OR when we have values */}
          {(isEncrypting || canSubmitScalar) && (
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="px-3 py-2 bg-(--card-content)/60 border-b border-border flex items-center gap-2">
                {isEncrypting && (
                  <span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                )}
                <span className="mono text-[9px] uppercase tracking-widest text-(--text-muted)">
                  {isEncrypting
                    ? "Generating ciphertexts…"
                    : "Generated Ciphertexts"}
                </span>
              </div>
              <div className="px-3 py-1">
                {ciphertextRows.map(({ label, key }) => (
                  <CiphertextRow
                    key={key}
                    label={label}
                    value={scalarForm[key]}
                    isLoading={isEncrypting}
                    network={network}
                  />
                ))}
              </div>
            </div>
          )}

          {encryptScalarMutation.error && (
            <Alert
              variant="error"
              message={encryptScalarMutation.error.message}
            />
          )}
        </div>
      </div>

      {/* Step 3 — Configure On-chain */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <StepNum n={3} done={scalarMutation.isSuccess} />
          <div>
            <span className="mono text-[11px] font-semibold text-(--text-main) block">
              Configure On-chain
            </span>
            <p className="text-[11px] text-(--text-muted)">
              Sign and submit the guardrail configuration to the treasury.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          icon={<Send size={13} animateOnHover />}
          loading={scalarMutation.isPending}
          onClick={() => scalarMutation.mutate()}
          disabled={!canSubmitScalar || scalarMutation.isPending}
          className="shrink-0"
        >
          {hasExisting ? "Update Guardrails" : "Configure Guardrails"}
        </Button>
      </div>

      {scalarMutation.isSuccess && (
        <div className="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-sm">
          <Checkcircle
            size={14}
            animateOnHover
            className="text-success shrink-0"
          />
          <div>
            <p className="mono text-[11px] font-bold text-success uppercase tracking-wide">
              {hasExisting ? "Guardrails updated" : "Guardrails configured"}
            </p>
            <p className="text-[11px] text-(--text-muted) mt-0.5">
              The treasury now enforces FHE-encrypted spending limits.
            </p>
          </div>
        </div>
      )}

      {scalarMutation.error && (
        <div className="border border-danger/20 bg-danger/10 rounded-sm p-3">
          <p className="text-[11px] font-bold text-danger mb-1">
            Transaction failed
          </p>
          <p className="text-[11px] text-danger/80 break-all">
            {scalarMutation.error.message}
          </p>
          {(scalarMutation.error as { logs?: string[] }).logs?.length ? (
            <details className="mt-2">
              <summary className="mono text-[10px] text-danger/60 cursor-pointer">
                Show logs
              </summary>
              <pre className="mt-2 mono text-[10px] text-danger/60 whitespace-pre-wrap break-all">
                {(scalarMutation.error as { logs?: string[] }).logs?.join("\n")}
              </pre>
            </details>
          ) : null}
        </div>
      )}

      {/* FHE mode badge — moved to right panel */}
    </div>
  );
}
