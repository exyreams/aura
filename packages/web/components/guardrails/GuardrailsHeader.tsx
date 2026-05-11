"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/global/Button";
import { ChevronLeft } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";

interface GuardrailsHeaderProps {
  treasury?: TreasuryEntry;
}

export function GuardrailsHeader({ treasury }: GuardrailsHeaderProps) {
  const { pda } = useParams();

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

      <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
        Confidential Guardrails
      </span>
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-(--text-main) mb-2">
        {" "}
        {treasury?.account.agentId ?? "Configure Guardrails"}
      </h1>
      <p className="text-(--text-muted) font-light text-sm">
        Encrypt spending limits as FHE ciphertexts and register them on-chain.
      </p>
    </header>
  );
}
