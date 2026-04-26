import { FileCheck, Globe, Lock, Shield, Users, Zap } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

export function Features() {
  const features = [
    {
      icon: Shield,
      title: "11-Rule Policy Engine",
      detail:
        "Comprehensive evaluation including velocity limits, time windows, protocol whitelists, slippage protection, and reputation scaling.",
    },
    {
      icon: Lock,
      title: "FHE Encrypted Limits",
      detail:
        "Daily limits, per-transaction caps, and spending counters stored as FHE ciphertexts, preventing MEV exploitation.",
    },
    {
      icon: Zap,
      title: "Multi-Chain Execution",
      detail:
        "Native support for Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism via Ika dWallet co-signing.",
    },
    {
      icon: Users,
      title: "Agent Swarms",
      detail:
        "Shared spending pools across multiple agents with unified policy enforcement and aggregate spending tracking.",
    },
    {
      icon: FileCheck,
      title: "Audit Trail",
      detail:
        "Append-only audit log of all treasury operations with cryptographic signatures and timestamp verification.",
    },
    {
      icon: Globe,
      title: "Emergency Governance",
      detail:
        "Guardian multisig override for break-glass scenarios with threshold signatures from designated responders.",
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
          <h2 className="text-3xl md:text-4xl font-bold text-(--text-main)">
            Built for real operators, not mock treasury demos
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            Production-ready infrastructure for autonomous treasury management
            with cryptographic guarantees.
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
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-(--primary)/10 flex items-center justify-center mb-4 md:mb-6 transition-colors group-hover:bg-(--primary)/20">
                  <Icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
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
