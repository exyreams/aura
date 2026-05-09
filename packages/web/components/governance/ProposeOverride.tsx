"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { Badge, Button, Card } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
import type { TreasuryEntry } from "@/lib/hooks";

interface ProposeOverrideProps {
  account?: TreasuryEntry["account"];
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
  const activeOverride = account?.multisig?.pendingOverride;

  return (
    <Card className="p-10" hover={false}>
      <div className="mb-10">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Propose Override
        </h2>
        <p className="text-sm text-(--text-muted)">
          Create a new daily limit increase proposal for the emergency multisig.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <form className="lg:col-span-7 space-y-8">
          <div className="grid grid-cols-1 gap-8">
            <UsdInput
              label="New daily limit"
              valueCents={overrideLimit}
              onChangeCents={setOverrideLimit}
              placeholder="25000.00"
            />
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
                    <h3 className="font-semibold text-(--text-main) text-sm">
                      {activeOverride.newDailyLimitUsd.toString()} cents limit
                      increase
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
                      {activeOverride.signaturesCollected.length} signatures
                    </span>
                  </div>
                  <div className="flex justify-between text-xs" suppressHydrationWarning>
                    <span className="text-(--text-muted)">Expires</span>
                    <span
                      className="text-(--text-muted) mono"
                      suppressHydrationWarning
                    >
                      {new Date(
                        Number(activeOverride.expiration.toString()) * 1000,
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
