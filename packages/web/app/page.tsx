import {
  AlertTriangle,
  ArrowRight,
  Bitcoin,
  Blocks,
  Bot,
  CheckCircle2,
  FileText,
  Lock,
  Shield,
  Sparkles,
  Waves,
} from "lucide-react";
import Link from "next/link";
import {
  appLinks,
  featureHighlights,
  supportedChains,
  treasuryStats,
} from "@/lib/mock-data";
import { cn, formatCurrency } from "@/lib/utils";

const problemOptions = [
  {
    title: "Give the model the keys",
    detail:
      "Fast, but one prompt mistake can move capital with no policy boundary.",
    icon: AlertTriangle,
    tone: "text-danger",
  },
  {
    title: "Use public spending limits",
    detail:
      "Auditable, but strategy and treasury posture leak on-chain before execution.",
    icon: Shield,
    tone: "text-warning",
  },
  {
    title: "Trust a centralized relay",
    detail:
      "Easy UX, but the operator becomes the weakest link and decision bottleneck.",
    icon: Blocks,
    tone: "text-slate-300",
  },
];

const howItWorks = [
  {
    title: "Create Treasury",
    detail:
      "Deploy a treasury with agent identity, authority keys, and baseline execution policy.",
  },
  {
    title: "Set Encrypted Limits",
    detail:
      "Configure scalar or vector guardrails with confidential limits and spending state.",
  },
  {
    title: "Agent Trades",
    detail:
      "Let the agent propose transactions while AURA enforces policy, overrides, and audit trails.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate overflow-hidden">
      <div className="hero-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,_rgba(51,241,197,0.24),_transparent_45%),radial-gradient(circle_at_20%_20%,_rgba(90,168,255,0.22),_transparent_35%)]" />

      <section className="page-shell pt-8 pb-18 md:pt-12 md:pb-24">
        <div className="flex items-center justify-between gap-6 rounded-full border border-white/10 bg-white/6 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/18 text-cyan-200 shadow-[0_0_28px_rgba(90,168,255,0.35)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.24em] text-cyan-100/80 uppercase">
                Aura
              </p>
              <p className="text-xs text-slate-400">
                Policy-aware treasury execution
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features">Features</a>
            <a href="#chains">Chains</a>
            <a href="#footer">Footer</a>
          </nav>
        </div>

        <div className="grid gap-12 py-18 lg:grid-cols-[minmax(0,1.2fr)_26rem] lg:items-end">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="status-dot bg-emerald-300" />
              AI treasury control plane for Solana and beyond
            </div>

            <div className="space-y-6">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Run autonomous treasury agents without giving up control.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                AURA combines policy enforcement, confidential guardrails, and
                emergency governance so an agent can trade within limits you can
                actually trust.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link className="button-primary" href="/app">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a className="button-secondary" href="#docs">
                Read Docs
                <FileText className="h-4 w-4" />
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="glass-panel p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Policy Engine
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  11 rules
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Velocity, slippage, quote freshness, risk score, TTL, and
                  more.
                </p>
              </div>
              <div className="glass-panel p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Guardrails
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  FHE ready
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Scalar and vector confidential limits with audit visibility.
                </p>
              </div>
              <div className="glass-panel p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Daily Volume
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {formatCurrency(treasuryStats.totalVolume)}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Aggregate simulated spend across managed treasuries.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-panel relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(90,168,255,0.18),_transparent_55%)]" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    Agent Treasury Status
                  </p>
                  <p className="text-xs text-slate-500">Devnet preview</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  <span className="status-dot bg-emerald-300" />
                  Running
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-black/30 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Treasury PDA
                    </p>
                    <p className="font-mono text-sm text-cyan-100">
                      8HUQ...t9wK
                    </p>
                  </div>
                  <Lock className="h-5 w-5 text-cyan-300" />
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-400">Daily spend</span>
                      <span className="text-white">
                        {formatCurrency(68240)} / {formatCurrency(95000)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8">
                      <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300" />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Policy preview
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        Swap on Solana, risk score 0.18, quote age 6s
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" />
                        Approved
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Guardrails
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        Scalar ciphertext accounts synced and verified.
                      </p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm text-cyan-200">
                        <Waves className="h-4 w-4" />
                        Live encryption lane
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["RPC", "Healthy"],
                  ["Wallet", "Disconnected"],
                  ["Override", "2 / 3 ready"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/8 bg-white/4 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-3">
          {problemOptions.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="glass-panel p-6">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6",
                    item.tone,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {item.detail}
                </p>
              </article>
            );
          })}
        </section>
      </section>

      <section className="page-shell grid gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <p className="eyebrow">How It Works</p>
          <h2 className="section-title">
            From idle treasury to policy-constrained execution.
          </h2>
          <p className="section-copy">
            The agent never gets a blank check. AURA stages every treasury move
            through explicit configuration, encrypted limits, and policy
            evaluation before execution.
          </p>
        </div>
        <div className="grid gap-4">
          {howItWorks.map((step, index) => (
            <article
              key={step.title}
              className="glass-panel flex items-start gap-5 p-6"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/12 text-lg font-semibold text-cyan-200">
                0{index + 1}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  {step.detail}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="page-shell py-16">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Feature Highlights</p>
            <h2 className="section-title">
              Control layers designed for live agents.
            </h2>
          </div>
          <Link className="button-secondary" href={appLinks[0].href}>
            Open dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureHighlights.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="glass-panel p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/7 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {feature.detail}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="chains" className="page-shell py-16">
        <div className="glass-panel p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Supported Chains</p>
              <h2 className="section-title">
                Operate across the networks your agents already watch.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              dWallet registration, chain-aware limits, and policy evaluation
              are designed for mixed-chain execution paths.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supportedChains.map((chain) => (
              <div
                key={chain.name}
                className="rounded-3xl border border-white/8 bg-white/4 p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8 text-cyan-100">
                    {chain.name === "Bitcoin" ? (
                      <Bitcoin className="h-5 w-5" />
                    ) : chain.name === "Solana" ? (
                      <Waves className="h-5 w-5" />
                    ) : (
                      <Bot className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">
                      {chain.name}
                    </p>
                    <p className="text-sm text-slate-400">{chain.status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="footer" className="page-shell pb-12 pt-8">
        <div className="glass-panel flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-white">AURA</p>
            <p className="mt-2 text-sm text-slate-400">
              Program ID:{" "}
              <span className="font-mono text-slate-200">
                AURA1111111111111111111111111111111111111
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <a id="docs" href="https://github.com">
              GitHub
            </a>
            <a href="/app">Launch App</a>
            <a href="https://github.com">Docs</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
