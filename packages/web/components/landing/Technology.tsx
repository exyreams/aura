import { CheckCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/landing/Reveal";

const codeLines = [
  "AGENT_SESSION_VALID",
  "WALLET_REGISTRY_SYNCED",
  "RPC_BALANCE_REFRESHED",
  "POLICY_BUDGET_CHECK: PASS",
  "ADDRESS_LIST_CHECK: PASS",
  "OWNER_APPROVAL_REQUIRED",
  "DWALLET_SIGNATURE_REQUESTED",
  "SETTLEMENT_PENDING",
  "ACTIVITY_EVENT_WRITTEN",
  "RECOVERY_PATH_AVAILABLE",
  "CONFIDENTIAL_LIMIT_CHECK: OPTIONAL",
  "CONTROL_PLANE_READY",
];

const architecturePoints = [
  {
    title: "Web is the operator console",
    detail:
      "Owner auth, wallet registry views, agent sessions, activity, approvals, and recovery controls live in the control center.",
  },
  {
    title: "Conduit is the agent interface",
    detail:
      "AI agents use scoped tools and idempotent requests instead of touching owner wallets or inventing their own custody path.",
  },
  {
    title: "AURA is the source of policy truth",
    detail:
      "The Solana program owns treasury state, roles, proposals, policy accounts, settlement records, and dWallet references.",
  },
];

export function Technology() {
  const [visibleLines, setVisibleLines] = useState<string[]>(() =>
    codeLines.slice(0, 5),
  );
  const lineIdxRef = useRef(5);

  useEffect(() => {
    const interval = setInterval(() => {
      const lineIdx = lineIdxRef.current;
      setVisibleLines((prev) => {
        const nextLines = [...prev, codeLines[lineIdx]];
        if (nextLines.length > 5) {
          nextLines.shift();
        }
        return nextLines;
      });
      lineIdxRef.current = (lineIdx + 1) % codeLines.length;
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="architecture"
      className="border-t border-border relative overflow-hidden z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <div className="absolute right-auto left-0 top-0 [writing-mode:vertical-rl] text-[6rem] md:text-[10rem] font-black leading-none text-(--text-main)/2 pointer-events-none -z-10 uppercase">
        CONTROL
      </div>
      <Reveal className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-20 items-center">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Architecture
          </span>
          <h2 className="text-3xl md:text-5xl font-semibold mb-6 md:mb-8 leading-tight text-(--text-main)">
            Metadata for speed.
            <br />
            Chain state for truth.
          </h2>
          <p className="text-(--text-muted) text-base md:text-lg mb-6 md:mb-8 leading-relaxed">
            AURA separates the parts that move fast from the parts that move
            funds. Supabase can index owner and agent metadata, Conduit can
            accept agent requests, and the Solana program remains the authority
            for proposals, policy, dWallet records, and settlement state.
            Confidential FHE guardrails are supported where private policy
            thresholds matter, but they are not the whole product.
          </p>
          <ul className="space-y-4 md:space-y-6">
            {architecturePoints.map((point) => (
              <li key={point.title} className="flex gap-3 md:gap-4">
                <CheckCircle className="size-5 md:size-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="block font-bold text-(--text-main) text-sm md:text-base">
                    {point.title}
                  </span>
                  <span className="text-(--text-muted) text-xs md:text-sm">
                    {point.detail}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="bg-(--card-bg) border border-border rounded-md p-6 md:p-8 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <span className="font-mono text-[9px] md:text-[10px] text-primary uppercase tracking-widest">
                Request Pipeline
              </span>
              <div className="flex gap-1.5 md:gap-2">
                <div className="size-1.5 md:size-2 rounded-full bg-primary opacity-20" />
                <div className="size-1.5 md:size-2 rounded-full bg-primary opacity-40" />
                <div className="size-1.5 md:size-2 rounded-full bg-primary" />
              </div>
            </div>
            <div className="space-y-3 md:space-y-4 font-mono text-[10px] md:text-[11px]">
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">Agent request:</span>
                <span className="text-(--text-main)">transfer_intent</span>
              </div>
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">Control plane:</span>
                <span className="text-primary">session + metadata</span>
              </div>
              <div className="p-2.5 md:p-3 bg-(--card-content) border border-border rounded flex justify-between gap-2">
                <span className="text-(--text-muted)">AURA policy:</span>
                <span className="text-(--text-main)">proposal gated</span>
              </div>
              <div className="flex justify-center py-4 md:py-6">
                <div className="relative">
                  <div className="size-2.5 md:size-3 bg-primary shadow-[0_0_15px_var(--primary)] rounded-full animate-pulse" />
                  <div className="absolute inset-0 bg-primary blur-xl opacity-20" />
                </div>
              </div>
              <div className="p-2.5 md:p-3 bg-primary/10 border border-primary/30 rounded flex justify-between gap-2">
                <span className="text-(--text-main) font-bold">
                  Settlement:
                </span>
                <span className="text-primary font-bold">DWALLET_SIGNED</span>
              </div>
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border opacity-60 overflow-hidden">
                <div className="whitespace-pre text-[9px] md:text-[10px]">
                  {visibleLines.map((line) => (
                    <div key={line} className="text-(--text-muted) mb-1">
                      &gt; {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
