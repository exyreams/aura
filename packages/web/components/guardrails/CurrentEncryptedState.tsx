"use client";

import { Badge, Card, StatusPill } from "@/components/global";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface CurrentEncryptedStateProps {
  account?: TreasuryEntry["account"];
}

export function CurrentEncryptedState({ account }: CurrentEncryptedStateProps) {
  const guardrails = account?.confidentialGuardrails;
  const mode = guardrails?.guardrailVectorCiphertext
    ? "Vector"
    : guardrails
      ? "Scalar"
      : "Not configured";

  return (
    <section className="mb-12">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Current Encrypted State
        </h2>
        <p className="text-sm text-(--text-muted)">
          On-chain encrypted guardrails status.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5" hover={false}>
          <span className="mono text-[9px] uppercase text-(--text-muted) block mb-2">
            Encryption mode
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant={mode === "Not configured" ? "default" : "active"}
              className="text-[11px] px-2 py-0.5"
            >
              {mode}
            </Badge>
          </div>
        </Card>
        <Card className="p-5" hover={false}>
          <span className="mono text-[9px] uppercase text-(--text-muted) block mb-2">
            Encrypt network status
          </span>
          <div className="flex items-center gap-2">
            <StatusPill variant="active">Active</StatusPill>
          </div>
        </Card>
        <Card className="p-5 sm:col-span-2" hover={false}>
          <span className="mono text-[9px] uppercase text-(--text-muted) block mb-2">
            Ciphertext handles
          </span>
          <div className="space-y-1">
            {guardrails?.dailyLimitCiphertext && (
              <div className="text-[10px] text-(--text-muted) mono">
                daily:{" "}
                {shortenAddress(
                  guardrails.dailyLimitCiphertext.toBase58(),
                  6,
                  6,
                )}
              </div>
            )}
            {guardrails?.perTxLimitCiphertext && (
              <div className="text-[10px] text-(--text-muted) mono">
                per_tx:{" "}
                {shortenAddress(
                  guardrails.perTxLimitCiphertext.toBase58(),
                  6,
                  6,
                )}
              </div>
            )}
            {guardrails?.spentTodayCiphertext && (
              <div className="text-[10px] text-(--text-muted) mono">
                spent:{" "}
                {shortenAddress(
                  guardrails.spentTodayCiphertext.toBase58(),
                  6,
                  6,
                )}
              </div>
            )}
            {guardrails?.guardrailVectorCiphertext && (
              <div className="text-[10px] text-(--text-muted) mono">
                vector:{" "}
                {shortenAddress(
                  guardrails.guardrailVectorCiphertext.toBase58(),
                  6,
                  6,
                )}
              </div>
            )}
            {!guardrails && (
              <div className="text-[10px] text-(--text-muted) italic">
                No ciphertexts configured
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
