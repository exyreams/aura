"use client";

import { BarChart3, Layers } from "lucide-react";
import { Badge } from "@/components/global";
import { cn } from "@/lib/utils";

export type EncryptionMode = "scalar" | "vector";

interface EncryptionModeSelectorProps {
  mode: EncryptionMode;
  onModeChange: (mode: EncryptionMode) => void;
  activeMode?: EncryptionMode;
}

export function EncryptionModeSelector({
  mode,
  onModeChange,
  activeMode,
}: EncryptionModeSelectorProps) {
  return (
    <section className="mb-10">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Encryption Mode
        </h2>
        <p className="text-sm text-(--text-muted)">
          Choose how guardrail values are encrypted on-chain.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scalar */}
        <button
          type="button"
          onClick={() => onModeChange("scalar")}
          className={cn(
            "p-6 rounded-lg border transition-all text-left flex flex-col h-full group",
            mode === "scalar"
              ? "bg-white/5 border-(--text-muted) shadow-[inset_0_0_0_1px_var(--text-muted)]"
              : "bg-(--card-bg) border-border hover:border-white/20",
          )}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center border border-white/5">
              <BarChart3 className="w-5 h-5 text-(--text-muted) group-hover:text-(--text-main) transition-colors" />
            </div>
            {activeMode === "scalar" ? (
              <Badge variant="active" className="px-2 py-0.5 text-[9px]">
                Active
              </Badge>
            ) : activeMode === undefined ? (
              <Badge variant="active" className="px-2 py-0.5 text-[9px]">
                Recommended
              </Badge>
            ) : null}
          </div>
          <h3 className="text-(--text-main) font-bold mb-2">Scalar Mode</h3>
          <p className="text-xs text-(--text-muted) leading-relaxed">
            Individual ciphertext per limit. Works end-to-end on-chain — the
            recommended path.
          </p>
        </button>

        {/* Vector */}
        <button
          type="button"
          onClick={() => onModeChange("vector")}
          className={cn(
            "p-6 rounded-lg border transition-all text-left flex flex-col h-full group",
            mode === "vector"
              ? "bg-white/5 border-(--text-muted) shadow-[inset_0_0_0_1px_var(--text-muted)]"
              : "bg-(--card-bg) border-border hover:border-white/20",
          )}
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center border border-white/5">
              <Layers className="w-5 h-5 text-(--text-muted) group-hover:text-(--text-main) transition-colors" />
            </div>
            {activeMode === "vector" && (
              <Badge variant="active" className="px-2 py-0.5 text-[9px]">
                Active
              </Badge>
            )}
          </div>
          <h3 className="text-(--text-main) font-bold mb-2">Vector Mode</h3>
          <p className="text-xs text-(--text-muted) leading-relaxed">
            Encrypts all policy limits into a single vector ciphertext. More
            compact on-chain representation.
          </p>
        </button>
      </div>
    </section>
  );
}
