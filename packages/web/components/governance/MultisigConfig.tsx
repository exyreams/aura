"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { Tooltip } from "@/components/global/Tooltip";
import { Copy, Plus, Shield, Xcircle } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

export interface MultisigFormArgs {
  required: string;
  guardians: string[];
}

interface MultisigConfigProps {
  account?: TreasuryEntry["account"];
  multisigMutation: UseMutationResult<string, Error, MultisigFormArgs, unknown>;
}

function CopyBtn({ value }: { value: string }) {
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
        <Copy size={11} animateOnHover />
      </button>
    </Tooltip>
  );
}

export function MultisigConfig({
  account,
  multisigMutation,
}: MultisigConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [required, setRequired] = useState("2");
  const [guardians, setGuardians] = useState<string[]>([]);

  const openModal = () => {
    setRequired(account?.multisig?.requiredSignatures.toString() ?? "2");
    setGuardians(account?.multisig?.guardians.map((g) => g.toBase58()) ?? []);
    multisigMutation.reset();
    setIsOpen(true);
  };

  const addGuardian = () => setGuardians((prev) => [...prev, ""]);
  const removeGuardian = (i: number) =>
    setGuardians((prev) => prev.filter((_, idx) => idx !== i));
  const updateGuardian = (i: number, value: string) =>
    setGuardians((prev) => prev.map((g, idx) => (idx === i ? value : g)));

  const handleSave = () => {
    multisigMutation.mutate({ required, guardians: guardians.filter(Boolean) });
  };

  useEffect(() => {
    if (multisigMutation.isSuccess) setIsOpen(false);
  }, [multisigMutation.isSuccess]);

  const multisig = account?.multisig;
  const validGuardians = guardians.filter(Boolean).length;

  return (
    <>
      <Card className="p-6" hover={false}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-sm bg-(--card-content)/60 border border-border shrink-0 mt-0.5">
              <Shield
                size={16}
                className="text-(--text-muted)"
                animateOnHover
              />
            </div>
            <div>
              <h2 className="text-base font-semibold text-(--text-main) mb-1">
                Emergency Multisig
              </h2>
              <p className="text-xs text-(--text-muted)">
                Guardian multisig for break-glass daily limit overrides.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="small" onClick={openModal}>
            {multisig ? "Edit" : "Configure"}
          </Button>
        </div>

        {multisig ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2.5 bg-(--card-content)/60 border border-border rounded-sm">
              <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
                Threshold
              </span>
              <StatusPill variant="active" className="text-[9px]">
                {multisig.requiredSignatures}-of-{multisig.guardians.length}
              </StatusPill>
            </div>
            {multisig.guardians.map((guardian, i) => (
              <div
                key={guardian.toBase58()}
                className="flex items-center gap-2 px-3 py-2.5 bg-(--card-content)/60 border border-border rounded-sm"
              >
                <span className="mono text-[10px] text-(--text-muted) shrink-0">
                  {i + 1}.
                </span>
                <Tooltip content={guardian.toBase58()}>
                  <span className="mono text-[11px] text-(--text-main) truncate flex-1">
                    {shortenAddress(guardian.toBase58(), 10, 8)}
                  </span>
                </Tooltip>
                <CopyBtn value={guardian.toBase58()} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center border border-dashed border-border rounded-sm space-y-2">
            <Shield
              size={20}
              className="text-(--text-muted) mx-auto"
              animateOnHover
            />
            <p className="text-sm text-(--text-muted)">
              No multisig configured.
            </p>
            <p className="text-xs text-(--text-muted) opacity-60">
              Add guardians to enable emergency override proposals.
            </p>
          </div>
        )}
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Configure Multisig"
        footer={
          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleSave}
              loading={multisigMutation.isPending}
              disabled={validGuardians === 0 || !required}
            >
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Threshold */}
          <div className="flex items-center gap-4 p-4 bg-(--card-content)/60 border border-border rounded-sm">
            <div className="flex-1">
              <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block mb-1">
                Required signatures
              </span>
              <p className="text-[11px] text-(--text-muted)">
                How many guardians must sign to execute an override.
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={validGuardians || 1}
              value={required}
              onChange={(e) => setRequired(e.target.value)}
              className="font-mono w-20 text-center shrink-0"
            />
          </div>

          {/* Guardians */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest">
                Guardian addresses
              </span>
              <span className="mono text-[10px] text-(--text-muted)">
                {validGuardians} added
              </span>
            </div>

            <div className="space-y-2">
              {guardians.length === 0 ? (
                <div className="py-5 text-center text-xs text-(--text-muted) border border-dashed border-border rounded-sm">
                  No guardians yet — click Add Guardian below
                </div>
              ) : (
                guardians.map((address, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: guardian list uses stable index keys
                    key={`guardian-${i}`}
                    className="flex items-center gap-2 px-3 py-2 bg-(--card-content)/60 border border-border rounded-sm group hover:border-primary transition-colors"
                  >
                    <span className="mono text-[10px] text-(--text-muted) w-5 shrink-0 text-right">
                      {i + 1}.
                    </span>
                    <Input
                      className="mono text-xs flex-1 border-transparent bg-transparent focus:border-border px-2 py-1 h-7"
                      value={address}
                      onChange={(e) => updateGuardian(i, e.target.value)}
                      placeholder="Base58 public key..."
                    />
                    <button
                      type="button"
                      onClick={() => removeGuardian(i)}
                      className="text-(--text-muted) hover:text-danger p-1 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Xcircle size={13} animateOnHover />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={addGuardian}
              className="mt-3 mono text-[10px] text-(--text-muted) hover:text-(--text-main) flex items-center gap-1.5 transition-colors tracking-widest font-bold uppercase"
            >
              <Plus size={10} animateOnHover /> Add Guardian
            </button>
          </div>

          {multisigMutation.error && (
            <Alert variant="error" message={multisigMutation.error.message} />
          )}
        </div>
      </Modal>
    </>
  );
}
