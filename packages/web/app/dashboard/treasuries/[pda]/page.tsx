"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/global/Skeleton";
import { AuditTrail } from "@/components/treasuries/AuditTrail";
import { PendingProposals } from "@/components/treasuries/PendingProposals";
import { PolicyConfig } from "@/components/treasuries/PolicyConfig";
import { SpendingProgress } from "@/components/treasuries/SpendingProgress";
import { TreasuryHeader } from "@/components/treasuries/TreasuryHeader";
import { TreasuryStats } from "@/components/treasuries/TreasuryStats";
import { useTreasury } from "@/lib/hooks";

export default function TreasuryDetailsPage() {
  const params = useParams();
  const pda = params.pda as string;

  const treasuryQuery = useTreasury(pda);
  const treasury = treasuryQuery.data;
  const isLoading = treasuryQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-4 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!treasury) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-(--text-main) mb-2">
          Treasury Not Found
        </h2>
        <p className="text-(--text-muted)">
          The treasury at {pda} could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <TreasuryHeader treasury={treasury} pda={pda} />
      <TreasuryStats treasury={treasury} />

      <SpendingProgress treasury={treasury} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PolicyConfig treasury={treasury} />
        <AuditTrail pda={pda} />
      </div>

      <div className="pt-8 border-t border-border">
        <PendingProposals treasury={treasury} />
      </div>
    </div>
  );
}
