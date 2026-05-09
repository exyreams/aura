"use client";

import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/global";

export type EncryptionMode = "scalar";

interface EncryptionModeSelectorProps {
  active?: boolean;
}

export function EncryptionModeSelector({
  active,
}: EncryptionModeSelectorProps) {
  return (
    <section className="mb-10">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Encryption Mode
        </h2>
        <p className="text-sm text-(--text-muted)">
          Choose how guardrail values are encrypted on-chain.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-6 rounded-lg border text-left flex flex-col h-full bg-white/5 border-(--text-muted) shadow-[inset_0_0_0_1px_var(--text-muted)]">
          <div className="flex justify-between items-start mb-4">
            <div className="size-10 bg-white/5 rounded flex items-center justify-center border border-white/5">
              <BarChart3 className="size-5 text-(--text-main)" />
            </div>
            {active ? (
              <Badge variant="active" className="px-2 py-0.5 text-[9px]">
                Active
              </Badge>
            ) : (
              <Badge variant="active" className="px-2 py-0.5 text-[9px]">
                Recommended
              </Badge>
            )}
          </div>
          <h3 className="text-(--text-main) font-semibold mb-2">Scalar Mode</h3>
          <p className="text-xs text-(--text-muted) leading-relaxed">
            Individual ciphertexts for daily limit, per-transaction limit, and
            spent-today state. This is the canonical confidential policy path.
          </p>
        </div>
      </div>
    </section>
  );
}
