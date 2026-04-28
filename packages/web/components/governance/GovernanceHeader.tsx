"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface GovernanceHeaderProps {
  treasury?: TreasuryEntry;
}

export function GovernanceHeader({ treasury }: GovernanceHeaderProps) {
  const { pda } = useParams();

  return (
    <header className="mb-12 border-b border-white/5 pb-8">
      <Link
        href={`/dashboard/treasuries/${pda}`}
        className="inline-flex items-center gap-2 text-[10px] mono text-(--text-muted) hover:text-(--text-main) transition-colors mb-6 group"
      >
        <ArrowLeft className="w-3 h-3 transition-transform group-hover:-translate-x-1" />
        BACK TO TREASURY
      </Link>

      <span className="mono text-xs uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
        Governance Configuration
      </span>
      <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
        Emergency override and swarm settings
      </h1>
      <p className="text-(--text-muted) font-light">
        Configure governance for{" "}
        <span className="mono text-(--text-main) opacity-80">
          {treasury?.account.agentId ?? shortenAddress(pda as string, 8, 8)}
        </span>
      </p>
    </header>
  );
}
