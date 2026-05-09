"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Tooltip } from "@/components/global";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAppSettings } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface CurrentEncryptedStateProps {
  account?: TreasuryEntry["account"];
}

interface AddressRowProps {
  label: string;
  address: string;
  network: string;
  isLast?: boolean;
}

function AddressRow({ label, address, network, isLast }: AddressRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExplorer = () => {
    window.open(
      `https://explorer.solana.com/address/${address}?cluster=${network}`,
      "_blank",
    );
  };

  return (
    <div
      className={`flex items-center justify-between py-2 ${isLast ? "" : "border-b border-border"}`}
    >
      <span className="text-[10px] mono text-(--text-muted) uppercase shrink-0 mr-4">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip content={address}>
          <span className="text-[11px] mono text-(--text-main) cursor-default">
            <span className="hidden sm:inline">
              {shortenAddress(address, 12, 12)}
            </span>
            <span className="sm:hidden">{shortenAddress(address, 6, 6)}</span>
          </span>
        </Tooltip>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip content={copied ? "Copied!" : "Copy address"}>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-(--text-muted) hover:text-(--text-main) hover:bg-white/8 transition-colors cursor-pointer"
              aria-label="Copy address"
            >
              {copied ? (
                <Check className="size-3 text-active" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </Tooltip>
          <Tooltip content="View on Solana Explorer">
            <button
              type="button"
              onClick={handleOpenExplorer}
              className="p-1 rounded text-(--text-muted) hover:text-(--text-main) hover:bg-white/8 transition-colors cursor-pointer"
              aria-label="View on explorer"
            >
              <ExternalLink className="size-3" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function CurrentEncryptedState({ account }: CurrentEncryptedStateProps) {
  const settings = useAppSettings();
  const guardrails = account?.confidentialGuardrails;

  if (!guardrails) {
    return null;
  }

  const rows = [
    guardrails.dailyLimitCiphertext && {
      label: "daily_limit",
      address: guardrails.dailyLimitCiphertext.toBase58(),
    },
    guardrails.perTxLimitCiphertext && {
      label: "per_tx_limit",
      address: guardrails.perTxLimitCiphertext.toBase58(),
    },
    guardrails.spentTodayCiphertext && {
      label: "spent_today",
      address: guardrails.spentTodayCiphertext.toBase58(),
    },
  ].filter(Boolean) as { label: string; address: string }[];

  return (
    <section className="mb-12">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Current On-Chain State
        </h2>
        <p className="text-sm text-(--text-muted)">
          Encrypted guardrails currently configured for this treasury.
        </p>
      </div>

      <Card className="p-5" hover={false}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-(--text-muted) font-mono">
            Guardrails configured
          </span>
          <Badge variant="active" className="text-[11px] px-2 py-0.5">
            Scalar
          </Badge>
        </div>

        <div>
          {rows.map((row, idx) => (
            <AddressRow
              key={row.label}
              label={row.label}
              address={row.address}
              network={settings.network}
              isLast={idx === rows.length - 1}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
