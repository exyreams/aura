"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Input } from "@/components/global";

interface VectorConfigFormProps {
  account?: {
    policyConfig: {
      dailyLimitUsd: bigint;
      perTxLimitUsd: bigint;
    };
    policyState: {
      spentTodayUsd: bigint;
    };
  };
  vectorCiphertext: string;
  setVectorCiphertext: Dispatch<SetStateAction<string>>;
  vectorMutation: UseMutationResult<string, Error, void, unknown>;
}

export function VectorConfigForm({
  account,
  vectorCiphertext,
  setVectorCiphertext,
  vectorMutation,
}: VectorConfigFormProps) {
  const dailyLimit = account
    ? Number(account.policyConfig.dailyLimitUsd.toString())
    : 500000;
  const perTxLimit = account
    ? Number(account.policyConfig.perTxLimitUsd.toString())
    : 100000;
  const spentToday = account
    ? Number(account.policyState.spentTodayUsd.toString())
    : 0;

  return (
    <Card className="mb-10 p-6" hover={false}>
      <div className="mb-8">
        <h2 className="text-lg font-bold text-(--text-main) mb-1">
          Vector Configuration
        </h2>
        <p className="text-sm text-(--text-muted)">
          If you already have a guardrail vector ciphertext account, submit it
          here with the owner wallet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="space-y-2">
          <div className="mono text-[10px] uppercase text-(--text-muted) font-bold">
            Daily limit (USD cents)
          </div>
          <Input
            id="daily-limit-vector"
            type="number"
            value={dailyLimit}
            disabled
            className="font-mono"
          />
          <p className="mono text-[10px] text-(--text-muted)">
            ${(dailyLimit / 100).toFixed(2)}
          </p>
        </div>
        <div className="space-y-2">
          <div className="mono text-[10px] uppercase text-(--text-muted) font-bold">
            Per-transaction limit (USD cents)
          </div>
          <Input
            id="per-tx-vector"
            type="number"
            value={perTxLimit}
            disabled
            className="font-mono"
          />
          <p className="mono text-[10px] text-(--text-muted)">
            ${(perTxLimit / 100).toFixed(2)}
          </p>
        </div>
        <div className="space-y-2">
          <div className="mono text-[10px] uppercase text-(--text-muted) font-bold">
            Current spent today (USD cents)
          </div>
          <Input
            id="spent-today-vector"
            type="number"
            value={spentToday}
            disabled
            className="font-mono"
          />
          <p className="mono text-[10px] text-(--text-muted)">
            ${(spentToday / 100).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mb-10">
        <span className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-4">
          Vector Preview
        </span>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex gap-1">
            <div className="px-6 py-4 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main) text-center">
              Daily: {dailyLimit / 100}
            </div>
            <div className="px-6 py-4 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main) text-center">
              PerTx: {perTxLimit / 100}
            </div>
            <div className="px-6 py-4 bg-white/5 border border-white/10 rounded mono text-[11px] text-(--text-main) text-center">
              Spent: {spentToday / 100}
            </div>
          </div>
          <ArrowRight className="text-slate-600 hidden md:block" />
          <div className="px-6 py-3 bg-white/2 border border-white/10 border-dashed rounded text-(--text-muted) mono text-xs italic">
            Encrypted as single ciphertext
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <label
          htmlFor="vector-ciphertext"
          className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
        >
          Vector ciphertext
        </label>
        <Input
          id="vector-ciphertext"
          className="mono text-xs"
          value={vectorCiphertext}
          onChange={(e) => setVectorCiphertext(e.target.value)}
          placeholder="Ciphertext public key..."
        />
      </div>

      <div className="pt-6 border-t border-white/5 mt-6">
        <Button
          variant="primary"
          className="min-w-[240px] font-mono tracking-widest text-xs"
          loading={vectorMutation.isPending}
          onClick={() => vectorMutation.mutate()}
          disabled={!vectorCiphertext}
        >
          Submit Vector Ciphertext
        </Button>
        {vectorMutation.error && (
          <div className="text-xs text-danger mt-4">
            {vectorMutation.error.message}
          </div>
        )}
      </div>
    </Card>
  );
}
