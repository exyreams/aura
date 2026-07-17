"use client";

import { FileText } from "lucide-react";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { DWalletDetailsPanel } from "@/components/wallets/DWalletDetailsPanel";
import type { WalletRegistryRow } from "@/lib/supabase/types";

function statusTone(status: string) {
  if (status === "onchain_registered" || status === "ika_provisioned") {
    return "success" as const;
  }

  if (status === "metadata_registered" || status === "unknown") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function DWalletDetailsModal({
  open,
  wallet,
  onClose,
}: {
  open: boolean;
  wallet: WalletRegistryRow;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="dwallet-details-title"
      ariaDescribedBy="dwallet-details-description"
      className="sm:max-w-2xl"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
            <FileText className="size-5 text-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="dwallet-details-title" className="text-lg font-semibold">
                Wallet details
              </h2>
              <StatusBadge tone={statusTone(wallet.status)}>
                {statusLabel(wallet.status)}
              </StatusBadge>
            </div>
            <p
              id="dwallet-details-description"
              className="mt-1 text-sm leading-6 text-muted-foreground"
            >
              {wallet.label || `${wallet.chain_name} dWallet`}
            </p>
          </div>
        </div>

        <DWalletDetailsPanel wallet={wallet} />
      </div>
    </Modal>
  );
}
