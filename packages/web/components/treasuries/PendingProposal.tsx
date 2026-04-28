import { StatusPill } from "@/components/global/Badge";
import { Card } from "@/components/global/Card";

export const PendingProposal = () => {
  return (
    <Card hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Pending Proposal
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Current pending proposal decoded from the treasury account.
        </p>
      </div>

      <div className="p-6 rounded-sm border border-(--warning-border) bg-(--warning-bg)">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="font-mono text-[10px] text-(--warning-text) mb-1">
              PROP-2024-0891
            </div>
            <h3 className="font-bold text-(--text-main)">
              $450.00 Swap Proposal
            </h3>
          </div>
          <StatusPill variant="medium">Pending Approval</StatusPill>
        </div>

        <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
              Chain
            </span>
            <span className="font-mono text-sm text-(--text-main)">Solana</span>
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
              Type
            </span>
            <span className="font-mono text-sm text-(--text-main)">Swap</span>
          </div>
          <div className="col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-1">
              Recipient
            </span>
            <span className="font-mono text-sm text-(--text-main) truncate block">
              8xK2R9m5jP...mN9p
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-(--warning-border) flex justify-between items-center">
          <span className="font-mono text-[10px] text-(--warning-text) opacity-80">
            Awaiting multisig...
          </span>
          <button
            type="button"
            className="text-[10px] font-mono uppercase text-(--text-main) hover:underline transition-all"
          >
            View Details
          </button>
        </div>
      </div>
    </Card>
  );
};
