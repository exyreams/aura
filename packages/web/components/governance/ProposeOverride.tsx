"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { Badge, Button, Card } from "@/components/global";
import { Alert } from "@/components/global/Alert";
import { UsdInput } from "@/components/global/UsdInput";
import { ShieldCheck, TriangleAlert } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

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
  const required = account?.multisig?.requiredSignatures ?? 0;
  const collected = activeOverride?.signaturesCollected.length ?? 0;
  const progress =
    required > 0 ? Math.min(100, (collected / required) * 100) : 0;

  return (
    <Card className="p-6" hover={false}>
      {/* Section header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 rounded-sm bg-(--card-content)/60 border border-border shrink-0 mt-0.5">
          <TriangleAlert
            size={16}
            className="text-(--text-muted)"
            animateOnHover
          />
        </div>
        <div>
          <h2 className="text-base font-semibold text-(--text-main) mb-1">
            Override Proposal
          </h2>
          <p className="text-xs text-(--text-muted)">
            Propose or sign a daily limit increase via the emergency multisig.
          </p>
        </div>
      </div>

      {/* Active override status */}
      {activeOverride ? (
        <div className="mb-6 p-4 bg-warning/5 border border-warning/20 rounded-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase text-warning tracking-widest font-bold">
              Active Proposal
            </span>
            <Badge variant="paused" className="text-[8px]">
              Awaiting Sigs
            </Badge>
          </div>

          <div>
            <div className="text-sm font-semibold text-(--text-main)">
              {formatCurrency(
                Number(activeOverride.newDailyLimitUsd.toString()) / 100,
              )}{" "}
              new daily limit
            </div>
            <div
              className="text-[10px] text-(--text-muted) mono mt-0.5"
              suppressHydrationWarning
            >
              Expires{" "}
              {new Date(
                Number(activeOverride.expiration.toString()) * 1000,
              ).toLocaleString()}
            </div>
          </div>

          {/* Signature progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] text-(--text-muted)">
                Signatures
              </span>
              <span className="mono text-[10px] text-(--text-main) font-bold">
                {collected} / {required}
              </span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-warning rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => overrideCollectMutation.mutate()}
            loading={overrideCollectMutation.isPending}
          >
            Sign Override
          </Button>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-(--card-content)/60 border border-border rounded-sm flex items-center gap-3">
          <ShieldCheck
            size={15}
            className="text-(--text-muted) shrink-0"
            animateOnHover
          />
          <span className="text-xs text-(--text-muted)">
            No active override proposals
          </span>
        </div>
      )}

      {/* New proposal form */}
      <div className="space-y-4">
        <div className="border-t border-border pt-4">
          <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block mb-4">
            New Proposal
          </span>
          <UsdInput
            label="New daily limit"
            valueCents={overrideLimit}
            onChangeCents={setOverrideLimit}
            placeholder="25000.00"
          />
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => overrideProposeMutation.mutate()}
          loading={overrideProposeMutation.isPending}
          disabled={
            !overrideLimit || overrideLimit === "0" || !account?.multisig
          }
        >
          Propose Override
        </Button>

        {!account?.multisig && (
          <p className="text-[10px] text-(--text-muted) mono text-center">
            Configure a multisig first to propose overrides.
          </p>
        )}

        {(overrideProposeMutation.error || overrideCollectMutation.error) && (
          <Alert
            variant="error"
            message={
              overrideProposeMutation.error?.message ??
              overrideCollectMutation.error?.message ??
              ""
            }
          />
        )}
      </div>
    </Card>
  );
}
