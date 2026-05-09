import { FileCheck, Globe, Lock, Shield, Users, Zap } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

export function Features() {
  const features = [
    {
      icon: Lock,
      title: "FHE Encrypted Limits",
      detail:
        "Daily limits, per-transaction caps, and running spend counters stored as FHE scalar ciphertexts on-chain via Ika's Encrypt network. No validator, observer, or MEV bot can read the actual values.",
    },
    {
      icon: Zap,
      title: "dWallet Multi-Chain Execution",
      detail:
        "Approved proposals are co-signed by Ika dWallet records. Native execution on Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism — no bridges, no raw key exposure.",
    },
    {
      icon: Shield,
      title: "17-Rule Policy Engine",
      detail:
        "Public rules evaluated locally before any FHE call: per-tx and daily limits, velocity, time windows, slippage, protocol allowlists, counterparty risk, reputation scaling, approval ladders, budget envelopes, swarm pool, and scoped pauses.",
    },
    {
      icon: Users,
      title: "Agent Swarms",
      detail:
        "Multiple agents share a single treasury with a unified spending pool. Aggregate spend is tracked across all members — one agent can't exceed the collective cap.",
    },
    {
      icon: FileCheck,
      title: "Governance and Safety",
      detail:
        "Emergency multisig override, guardian co-signing, AI authority rotation, dangerous-config timelocks, session keys, and scoped pauses for break-glass scenarios.",
    },
    {
      icon: Globe,
      title: "Audit and Observability",
      detail:
        "Append-only audit trail, policy receipts, decision history, activity logs, health scoring, snapshots, and invariant reports — full operational visibility without exposing strategy.",
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
            Built for real operators, not mock treasury demos
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            Every component is production-grade and deployed on Solana devnet.
            Cryptographic guarantees, not configuration flags.
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
                <div className="size-10 md:size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 md:mb-6 transition-colors group-hover:bg-primary/20">
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
