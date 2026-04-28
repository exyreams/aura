"use client";

import { cn } from "@/lib/utils";

export type ProposalMode = "public" | "confidential";

interface ProposalModeSelectorProps {
  mode: ProposalMode;
  onModeChange: (mode: ProposalMode) => void;
}

export function ProposalModeSelector({
  mode,
  onModeChange,
}: ProposalModeSelectorProps) {
  return (
    <div className="space-y-4 pt-10 border-t border-white/5">
      <div className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block">
        Proposal Mode
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <button
          type="button"
          onClick={() => onModeChange("public")}
          className={cn(
            "flex-1 p-5 border rounded-sm transition-all text-left flex items-start gap-4",
            mode === "public"
              ? "bg-white/5 border-(--text-main)"
              : "bg-white/1 border-border hover:border-white/20",
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1",
              mode === "public" ? "border-(--text-main)" : "border-border",
            )}
          >
            {mode === "public" && (
              <div className="w-2 h-2 rounded-full bg-(--text-main)" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-(--text-main) mb-1">
              Public
            </div>
            <p className="text-[11px] text-(--text-muted) leading-relaxed">
              Proposal details visible on-chain. Faster execution but exposes
              strategy.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onModeChange("confidential")}
          className={cn(
            "flex-1 p-5 border rounded-sm transition-all text-left flex items-start gap-4",
            mode === "confidential"
              ? "bg-white/5 border-(--text-main)"
              : "bg-white/1 border-border hover:border-white/20",
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1",
              mode === "confidential"
                ? "border-(--text-main)"
                : "border-border",
            )}
          >
            {mode === "confidential" && (
              <div className="w-2 h-2 rounded-full bg-(--text-main)" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold text-(--text-main) mb-1">
              Confidential
            </div>
            <p className="text-[11px] text-(--text-muted) leading-relaxed">
              Encrypted proposal via FHE. Slower but keeps details private.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
