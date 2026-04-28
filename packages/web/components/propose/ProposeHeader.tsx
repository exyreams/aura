"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/global";
import type { TreasuryEntry } from "@/lib/aura-app";

interface ProposeHeaderProps {
  treasury?: TreasuryEntry;
  network: "devnet" | "mainnet-beta";
}

export function ProposeHeader({ treasury, network }: ProposeHeaderProps) {
  const { pda } = useParams();

  return (
    <header className="mb-10" id="pageHeader">
      <Link
        href={`/dashboard/treasuries/${pda}`}
        className="inline-flex items-center gap-2 text-[10px] mono text-(--text-muted) hover:text-(--text-main) transition-colors mb-6 group"
      >
        <ArrowLeft className="w-3 h-3 transition-transform group-hover:-translate-x-1" />
        BACK TO TREASURY
      </Link>

      <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
        PROPOSE TRANSACTION
      </span>
      <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
        Submit a new transaction proposal
      </h1>
      <div className="flex items-center gap-3 text-(--text-muted) font-light">
        <span>Create a proposal for</span>
        <span className="mono text-(--text-main) font-bold bg-white/5 px-2 py-0.5 rounded-sm border border-white/5">
          {treasury?.account.agentId ?? "Loading..."}
        </span>
        <span>on</span>
        <Badge variant="low" className="px-2 py-0.5 lowercase">
          {network === "devnet" ? "Devnet" : "Mainnet-Beta"}
        </Badge>
      </div>
    </header>
  );
}
