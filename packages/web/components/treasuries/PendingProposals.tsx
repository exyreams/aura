import Link from "next/link";
import { StatusPill } from "@/components/global/Badge";
import {
  CHAINS,
  getActivePendingProposal,
  PROPOSAL_STATUSES,
  TX_TYPES,
} from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

interface PendingProposalsProps {
  treasury: TreasuryEntry;
  pda: string;
}

export const PendingProposals = ({ treasury, pda }: PendingProposalsProps) => {
  const pending = getActivePendingProposal(treasury.account);
  const hasPending = pending && Number(pending.proposalId.toString()) > 0;

  if (!hasPending) {
    return (
      <div>
        <div className="mb-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
              Queue
            </span>
            <span className="px-2 py-0.5 bg-(--card-bg) border border-border rounded-sm text-[10px] font-mono text-(--text-muted)">
              0 PENDING
            </span>
          </div>
          <h2 className="text-xl font-bold text-(--text-main) mb-1">
            Pending Proposals
          </h2>
          <p className="text-[12px] text-(--text-muted)">
            Transactions awaiting multisig approval.
          </p>
        </div>
        <div className="p-8 text-center border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">No pending proposals</p>
          <Link
            href={`/dashboard/treasuries/${pda}/propose`}
            className="inline-flex mt-4 text-[10px] font-mono uppercase tracking-wider text-(--text-main) hover:text-primary transition-colors"
          >
            Create Proposal
          </Link>
        </div>
      </div>
    );
  }

  const chain =
    CHAINS.find((c) => c.code === pending.targetChain)?.label || "Unknown";
  const txType =
    TX_TYPES.find((t) => t.code === pending.txType)?.label || "Unknown";
  const status = PROPOSAL_STATUSES[pending.status] || "Unknown";
  const amountUsd = Number(pending.amountUsd.toString());

  const statusVariant =
    pending.status === 3
      ? ("active" as const)
      : pending.status === 4
        ? ("error" as const)
        : ("medium" as const);

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
            Queue
          </span>
          <span className="px-2 py-0.5 bg-(--warning-bg) border border-(--warning-border) rounded-sm text-[10px] font-mono text-(--warning-text)">
            1 AWAITING MULTISIG
          </span>
        </div>
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Pending Proposals
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Transactions awaiting multisig approval.
        </p>
      </div>

      <div className="border border-border rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-(--card-content) border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Proposal ID
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Type
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Chain
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Amount
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Recipient
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Status
              </th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border hover:bg-(--hover-bg) transition-colors">
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                PROP-{pending.proposalId.toString().padStart(4, "0")}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {txType}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {chain}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {formatCurrency(amountUsd)}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-muted)">
                {shortenAddress(pending.recipientOrContract, 6, 4)}
              </td>
              <td className="px-4 py-4">
                <StatusPill
                  variant={statusVariant}
                  className="text-[10px] px-3 py-1"
                >
                  {status.toUpperCase()}
                </StatusPill>
              </td>
              <td className="px-4 py-4 text-right">
                <Link
                  href={`/dashboard/treasuries/${pda}/propose`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase text-(--text-main) hover:text-primary transition-colors"
                >
                  VIEW DETAILS
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
