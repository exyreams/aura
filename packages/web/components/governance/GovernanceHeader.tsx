"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/global/Button";
import { ChevronLeft } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface GovernanceHeaderProps {
  treasury?: TreasuryEntry;
}

export function GovernanceHeader({ treasury }: GovernanceHeaderProps) {
  const { pda } = useParams<{ pda: string }>();

  return (
    <header className="mb-8">
      <Link href={`/dashboard/treasuries/${pda}`} className="inline-block mb-6">
        <Button
          variant="ghost"
          size="small"
          icon={<ChevronLeft size={12} animateOnHover />}
          iconPosition="left"
          className="mono text-[10px] uppercase tracking-widest"
        >
          Back to Treasury
        </Button>
      </Link>

      <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-3 block">
        Governance Configuration
      </span>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-(--text-main) mb-2">
            Governance
          </h1>
          <p className="text-(--text-muted) font-light text-sm">
            Multisig, swarm, and emergency override controls for{" "}
            <Link
              href={`/dashboard/treasuries/${pda}`}
              className="mono text-(--text-main) opacity-80 hover:opacity-100 transition-opacity"
            >
              {treasury?.account.agentId ?? shortenAddress(pda as string, 8, 8)}
            </Link>
          </p>
        </div>
      </div>
    </header>
  );
}
