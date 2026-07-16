"use client";

import { Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { formatAddress } from "@/lib/formatting/addresses";
import type { WalletRegistryRow } from "@/lib/supabase/types";

function explorerUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function statusTone(status: string) {
  return status === "onchain_registered" || status === "ika_provisioned"
    ? "success"
    : "warning";
}

export function WalletReceiveModal({
  open,
  wallet,
  onClose,
}: {
  open: boolean;
  wallet: WalletRegistryRow;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const supportsExplorer = wallet.chain_id === SOLANA_CHAIN_ID;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.chain_address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="wallet-receive-title"
      ariaDescribedBy="wallet-receive-description"
      className="sm:max-w-xl"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <Wallet className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="wallet-receive-title" className="text-lg font-semibold">
              Receive funds
            </h2>
            <p
              id="wallet-receive-description"
              className="mt-1 text-sm leading-6 text-muted-foreground"
            >
              Send {wallet.chain_name} assets to this registered wallet address.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{wallet.wallet_kind}</StatusBadge>
            <StatusBadge tone={statusTone(wallet.status)}>
              {wallet.status}
            </StatusBadge>
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Deposit address
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">
            {wallet.chain_address}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {formatAddress(wallet.chain_address)}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copyAddress()}
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? "Copied" : "Copy address"}
          </Button>
          {supportsExplorer ? (
            <a
              href={explorerUrl(wallet.chain_address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-surface px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ExternalLink className="size-4" aria-hidden />
              Explorer
            </a>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
