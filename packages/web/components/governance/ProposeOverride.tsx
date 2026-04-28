"use client";

import type { UseMutationResult } from "@tantml:react-query";
import type { Dispatch, SetStateAction } from "react";
import { Badge, Button, Card, Input } from "@/components/global";

interface ProposeOverrideProps {
  account?: {
    multisig?: {
      activeOverride?: {
        newDailyLimitUsd: number;
        proposedAt: number;
        expiresAt: number;
        signatures: number;
      };
    };
  };
  overrideLimit: string;
  setOverrideLimit: Dispatch<SetStateAction<string>>;
  overrideProposeMutation: UseMutationResult<string, Error, void, unknown>;
  overrideCollectMutation: UseMutationResult<string, Error, void, unknown>;
}

export function ProposeOverride({
  account,
  overrideLimit,
  setOverrideLimit,
  overrideProposeMutation,
  overrideCollectMutation,
}: ProposeOverrideProps) {
  const activeOverride = account?.multisig?.activeOverride;

  return (
    <Card className="p-10" hover={false}>
      <div className="mb-10">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Propose Override
        </h2>
        <p className="text-sm text-(--text-muted)">
          Create a new daily limit increase proposal for the emergency multisig.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <form className="lg:col-span-7 space-y-8">
          <div className="grid grid-cols-1 gap-8">
            <div className="space-y-2">
              <label
                htmlFor="override-limit"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block tracking-widest mb-4"
              >
                New daily limit (USD cents)
              </label>
              <Input
                id="override-limit"
                type="number"
                value={overrideLimit}
                onChange={(e) => setOverrideLimit(e.target.value)}
                className="font-mono"
                placeholder="2500000"
              />
              <p className="text-[11px] text-(--text-muted) mono">
                ${(Number(overrideLimit) / 100).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="primary"
              className="px-12"
              onClick={() => overrideProposeMutation.mutate()}
              loading={overrideProposeMutation.isPending}
              disabled={!overrideLimit || !account?.multisig}
            >
              Propose Override
            </Button>
            <Button
              variant="secondary"
              onClick={() => overrideCollectMutation.mutate()}
              loading={overrideCollectMutation.isPending}
              disabled={!activeOverride}
            >
              Sign Override
            </Button>
          </div>
          {(overrideProposeMutation.error || overrideCollectMutation.error) && (
            <div className="text-xs text-danger">
              {overrideProposeMutation.error?.message ||
                overrideCollectMutation.error?.message}
            </div>
          )}
        </form>

        <div className="lg:col-span-5 space-y-6">
          <span className="mono text-[10px] uppercase text-(--text-muted) font-bold block tracking-widest">
            Active Proposals
          </span>
          <div className="space-y-4">
            {activeOverride ? (
              <div className="p-5 bg-white/3 border border-warning/20 rounded relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] mono text-warning mb-1">
                      ACTIVE-OVERRIDE
                    </div>
                    <h3 className="font-bold text-(--text-main) text-sm">
                      ${(activeOverride.newDailyLimitUsd / 100).toFixed(2)}{" "}
                      Limit Increase
                    </h3>
                  </div>
                  <Badge variant="paused" className="text-[8px]">
                    Awaiting Sigs
                  </Badge>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-xs">
                    <span className="text-(--text-muted)">Status</span>
                    <span className="text-(--text-main) mono font-bold">
                      {activeOverride.signatures} signatures
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-(--text-muted)">Proposed</span>
                    <span className="text-(--text-muted) mono">
                      {new Date(
                        activeOverride.proposedAt * 1000,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-white/2 border border-white/5 rounded text-center text-xs text-(--text-muted) italic">
                No active override proposals
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
