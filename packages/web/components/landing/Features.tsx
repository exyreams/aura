import {
  Activity,
  Bot,
  FileCheck,
  KeyRound,
  Lock,
  Shield,
  Wallet,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

export function Features() {
  const features = [
    {
      icon: Wallet,
      title: "Wallet Control Center",
      detail:
        "Owners can see registered agent wallets, chain addresses, dWallet metadata, and live Solana balances without trusting cached balance rows.",
    },
    {
      icon: Bot,
      title: "Conduit Agent Sessions",
      detail:
        "AI-facing tools can use scoped sessions, device approvals, idempotency keys, sign requests, and activity events instead of raw owner wallet access.",
    },
    {
      icon: Shield,
      title: "On-Chain Policy Engine",
      detail:
        "Budgets, exposure groups, address lists, chain profiles, velocity limits, session quotas, scoped pauses, and approval ladders gate proposals before settlement.",
    },
    {
      icon: KeyRound,
      title: "dWallet Settlement",
      detail:
        "Approved proposals can be routed through dWallet records so an agent can execute without directly holding the private key that controls funds.",
    },
    {
      icon: Lock,
      title: "Confidential Policy State",
      detail:
        "Where private thresholds matter, AURA supports FHE-backed confidential guardrails for encrypted limits and spend counters.",
    },
    {
      icon: Activity,
      title: "Audit and Observability",
      detail:
        "Activity logs, policy receipts, snapshots, health scores, liveness checks, and close paths make agent activity reviewable over time.",
    },
    {
      icon: FileCheck,
      title: "Recovery and Governance",
      detail:
        "Break-glass flows, guardian approvals, authority rotation, dangerous-config timelocks, and role records give owners operational exits.",
    },
  ];

  return (
    <section
      id="features"
      className="border-t border-border bg-(--text-main)/1 relative z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal className="max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Feature Surface
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold text-(--text-main)">
            Built around real agent operations
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            AURA spans the human dashboard, agent API path, Solana program
            state, policy enforcement, and dWallet settlement. Confidential
            guardrails are one capability inside that larger system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-(--bg) border border-border p-6 md:p-8 transition-all duration-300 hover:bg-white/5 hover:border-primary group"
              >
                <div className="size-10 md:size-12 rounded-md bg-primary/10 flex items-center justify-center mb-4 md:mb-6 transition-colors group-hover:bg-primary/20">
                  <Icon className="size-5 md:size-6 text-primary" />
                </div>
                <h3 className="text-base md:text-lg font-semibold text-(--text-main) mb-2 md:mb-3">
                  {feature.title}
                </h3>
                <p className="text-xs md:text-sm text-(--text-muted) leading-relaxed">
                  {feature.detail}
                </p>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
