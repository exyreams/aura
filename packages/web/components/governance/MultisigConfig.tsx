"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Card, Input, StatusPill } from "@/components/global";
import type { TreasuryEntry } from "@/lib/hooks";

interface MultisigConfigProps {
  account?: TreasuryEntry["account"];
  multisigForm: {
    required: string;
    guardians: string;
  };
  setMultisigForm: Dispatch<
    SetStateAction<{
      required: string;
      guardians: string;
    }>
  >;
  multisigMutation: UseMutationResult<string, Error, void, unknown>;
}

export function MultisigConfig({
  account,
  multisigForm,
  setMultisigForm,
  multisigMutation,
}: MultisigConfigProps) {
  const guardiansList = multisigForm.guardians
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const removeGuardian = (index: number) => {
    const updated = guardiansList.filter((_, i) => i !== index);
    setMultisigForm((current) => ({
      ...current,
      guardians: updated.join(", "),
    }));
  };

  const addGuardian = () => {
    setMultisigForm((current) => ({
      ...current,
      guardians: current.guardians ? `${current.guardians}, ` : "",
    }));
  };

  const updateGuardian = (index: number, value: string) => {
    const updated = [...guardiansList];
    updated[index] = value;
    setMultisigForm((current) => ({
      ...current,
      guardians: updated.join(", "),
    }));
  };

  return (
    <Card className="p-10" hover={false}>
      <div className="flex flex-col lg:flex-row justify-between gap-12">
        <div className="flex-1 space-y-8">
          <div>
            <h2 className="text-xl font-bold text-(--text-main) mb-1">
              Emergency Multisig
            </h2>
            <p className="text-sm text-(--text-muted)">
              Guardian multisig for break-glass daily limit increases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label
                htmlFor="required-signatures"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-4 tracking-widest"
              >
                Required signatures
              </label>
              <Input
                id="required-signatures"
                type="number"
                value={multisigForm.required}
                onChange={(e) =>
                  setMultisigForm((current) => ({
                    ...current,
                    required: e.target.value,
                  }))
                }
                className="font-mono"
              />
            </div>
            <div className="space-y-4">
              <div className="mono text-[10px] uppercase text-(--text-muted) font-bold block mb-4 tracking-widest">
                Guardian addresses
              </div>
              <div className="space-y-2">
                {guardiansList.length === 0 ? (
                  <div className="text-xs text-(--text-muted) italic">
                    No guardians configured
                  </div>
                ) : (
                  guardiansList.map((address) => (
                    <div
                      key={address || `empty-${Math.random()}`}
                      className="flex gap-2"
                    >
                      <Input
                        className="mono text-xs"
                        value={address}
                        onChange={(e) =>
                          updateGuardian(
                            guardiansList.indexOf(address),
                            e.target.value,
                          )
                        }
                        placeholder="Public key..."
                      />
                      <button
                        type="button"
                        onClick={() =>
                          removeGuardian(guardiansList.indexOf(address))
                        }
                        className="text-(--text-muted) hover:text-red-500 p-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={addGuardian}
                className="text-[10px] mono text-(--text-muted) hover:text-(--text-main) flex items-center gap-2 transition-colors tracking-widest font-bold"
              >
                <Plus className="w-3 h-3" /> ADD GUARDIAN
              </button>
            </div>
          </div>
        </div>

        <div className="lg:w-80 space-y-6 pt-2">
          <span className="mono text-[10px] uppercase text-(--text-muted) font-bold block tracking-widest">
            Current Configuration
          </span>
          <div className="p-4 bg-white/5 border border-white/5 rounded space-y-4">
            {account?.multisig ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-(--text-muted)">Threshold</span>
                  <StatusPill variant="active" className="text-[9px]">
                    {account.multisig.requiredSignatures}-of-
                    {account.multisig.guardians.length} signatures
                  </StatusPill>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] mono text-(--text-muted) uppercase">
                    Guardians
                  </span>
                  {account.multisig.guardians.map((guardian) => (
                    <div
                      key={guardian.toBase58()}
                      className="mono text-[10px] text-(--text-main) opacity-80 truncate"
                    >
                      {guardian.toBase58().slice(0, 8)}...
                      {guardian.toBase58().slice(-6)}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-(--text-muted) italic">
                No multisig configured
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => multisigMutation.mutate()}
              loading={multisigMutation.isPending}
              disabled={!multisigForm.guardians || !multisigForm.required}
            >
              Configure Multisig
            </Button>
            {multisigMutation.error && (
              <div className="text-xs text-danger">
                {multisigMutation.error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
