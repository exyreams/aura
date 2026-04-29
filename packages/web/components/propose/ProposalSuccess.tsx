"use client";

import { Check, ExternalLink } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button } from "@/components/global";
import { useAppSettings } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface ProposalSuccessProps {
  signature: string;
}

export function ProposalSuccess({ signature }: ProposalSuccessProps) {
  const router = useRouter();
  const { pda } = useParams();
  const settings = useAppSettings();

  return (
    <div className="text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col items-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center border border-success/30 mb-8">
          <Check className="w-8 h-8 text-success" />
        </div>

        <h2 className="text-2xl font-bold text-(--text-main) mb-2">
          Proposal Submitted
        </h2>
        <p className="text-(--text-muted) text-sm mb-10">
          Your transaction proposal has been successfully broadcast to the
          network for evaluation.
        </p>

        <div className="w-full space-y-4 mb-10">
          <div className="p-5 bg-white/2 border border-border rounded-sm text-left">
            <span className="mono text-[9px] uppercase text-(--text-muted) tracking-widest mb-2 block">
              Transaction Signature
            </span>
            <div className="flex items-center justify-between gap-3">
              <code className="mono text-xs text-(--text-main)">
                {shortenAddress(signature, 8, 8)}
              </code>
              <a
                href={`https://explorer.solana.com/tx/${signature}?cluster=${settings.network}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-3 h-3 text-(--text-muted) hover:text-(--text-main) cursor-pointer" />
              </a>
            </div>
          </div>
          <div className="p-5 bg-white/2 border border-border rounded-sm text-left">
            <span className="mono text-[9px] uppercase text-(--text-muted) tracking-widest mb-2 block">
              Current Status
            </span>
            <div className="flex mt-1">
              <Badge variant="paused">Pending evaluation</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <Button
            className="flex-1 py-4"
            variant="primary"
            onClick={() => router.push(`/dashboard/treasuries/${pda}`)}
          >
            VIEW TREASURY
          </Button>
          <Button
            className="flex-1 py-4"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            CREATE ANOTHER
          </Button>
        </div>
      </div>
    </div>
  );
}
