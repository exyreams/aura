"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { TreasuryEntry } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface GuardrailsHeaderProps {
  treasury?: TreasuryEntry;
}

export function GuardrailsHeader({ treasury }: GuardrailsHeaderProps) {
  const { pda } = useParams();

  return (
    <header className="mb-12" id="pageHeader">
      <Link
        href={`/dashboard/treasuries/${pda}`}
        className="inline-flex items-center gap-2 text-[10px] mono text-(--text-muted) hover:text-(--text-main) transition-colors mb-6 group"
      >
        <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-1" />
        BACK TO TREASURY
      </Link>

      <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
        CONFIDENTIAL GUARDRAILS
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-(--text-main) mb-3">
        Configure encrypted spending limits
      </h1>
      <p className="text-(--text-muted) font-light">
        Set FHE ciphertexts for{" "}
        <span className="text-(--text-main) mono opacity-80">
          {treasury?.account.agentId ?? shortenAddress(pda as string, 8, 8)}
        </span>
      </p>
    </header>
  );
}
