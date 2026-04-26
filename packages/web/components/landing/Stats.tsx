import { Cpu, Globe, Lock } from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

export function Stats() {
  const stats = [
    {
      icon: Lock,
      label: "Policy checks",
      value: "11 live rules",
      description:
        "Comprehensive evaluation including velocity limits, time windows, and slippage protection",
    },
    {
      icon: Globe,
      label: "Confidential lane",
      value: "Encrypt + dWallet",
      description:
        "FHE ciphertexts for private limits with dWallet multi-party computation for execution",
    },
    {
      icon: Cpu,
      label: "Execution mode",
      value: "Operator override ready",
      description:
        "Emergency governance with guardian multisig for break-glass scenarios",
    },
  ];

  return (
    <section className="max-w-6xl mx-auto z-10 px-6 py-[80px] md:px-[4vw]">
      <Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white/2 border border-border p-8 transition-all duration-300 hover:bg-white/5 hover:border-primary group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-500/10 flex items-center justify-center border border-slate-500/20 mb-6 transition-colors group-hover:bg-(--primary)/10 group-hover:border-(--primary)/30">
                  <Icon className="w-6 h-6 text-slate-400 group-hover:text-primary" />
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) mb-3">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold text-(--text-main) mb-4">
                  {stat.value}
                </p>
                <p className="text-sm text-(--text-muted) leading-relaxed">
                  {stat.description}
                </p>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
