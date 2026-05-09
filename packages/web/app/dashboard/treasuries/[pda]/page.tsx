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

  const bg = (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--grid) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          opacity: 0.5,
        }}
      />
      <div
        className="absolute top-[10%] right-[5%] size-[800px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.04) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-[20%] left-[5%] size-[800px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(107, 114, 128, 0.04) 0%, transparent 70%)",
        }}
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="relative min-h-screen">
        {bg}
        <div className="relative max-w-[1600px] mx-auto z-10 space-y-8">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-4 gap-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!treasury) {
    return (
      <div className="relative min-h-screen">
        {bg}
        <div className="relative max-w-[1600px] mx-auto z-10 text-center py-12">
          <h2 className="text-xl font-semibold text-(--text-main) mb-2">
            Treasury Not Found
          </h2>
          <p className="text-(--text-muted)">
            The treasury at {pda} could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {bg}
      <div className="relative max-w-[1600px] mx-auto z-10 space-y-8">
        <TreasuryHeader treasury={treasury} pda={pda} />
        <TreasuryStats treasury={treasury} />

        <SpendingProgress treasury={treasury} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PolicyConfig treasury={treasury} />
          <AuditTrail pda={pda} />
        </div>

        <div className="pt-8 border-t border-border">
          <PendingProposals treasury={treasury} pda={pda} />
        </div>
      </div>
    </div>
  );
}
