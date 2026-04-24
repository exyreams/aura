"use client";

import { AURA_PROGRAM_ID } from "@/lib/sdk";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ExternalLink,
  Lock,
  Radar,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { featureHighlights, supportedChains } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const proofPoints = [
  { label: "Policy checks", value: "11 live rules" },
  { label: "Confidential lane", value: "Encrypt + dWallet" },
  { label: "Execution mode", value: "Operator override ready" },
];

const steps = [
  {
    title: "Connect an operator wallet",
    detail:
      "Use the standard Solana wallet modal, then load the treasuries owned by that wallet inside the app.",
    icon: Waves,
  },
  {
    title: "Deploy guardrails before autonomy",
    detail:
      "Create a treasury, set daily and per-transaction policy, and keep limits encrypted where needed.",
    icon: Lock,
  },
  {
    title: "Let the agent propose, not improvise",
    detail:
      "Every move is checked, logged, and recoverable through multisig or swarm coordination.",
    icon: ShieldCheck,
  },
];

const signalCards = [
  {
    title: "Wallet-native operator flow",
    detail:
      "The app now starts with the actual Solana wallet modal instead of a burner wallet fallback.",
  },
  {
    title: "Real program deployment",
    detail: `Program ID seeded from the deployed AURA program: ${AURA_PROGRAM_ID.toBase58()}.`,
  },
  {
    title: "Backend-ready control path",
    detail:
      "Confidential proposal, decryption, and execution routes are wired for the local backend service.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate overflow-hidden pb-16">
      <div className="landing-orbit landing-orbit-a" aria-hidden="true" />
      <div className="landing-orbit landing-orbit-b" aria-hidden="true" />
      <div className="hero-grid absolute inset-0 opacity-25" aria-hidden="true" />

      <section className="page-shell pt-6 md:pt-8">
        <header className="glass-panel landing-nav px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="landing-mark">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white">
                AURA
              </p>
              <p className="text-xs text-slate-300">
                Autonomous treasury control plane
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
            <a href="#flow" className="nav-link">
              Flow
            </a>
            <a href="#features" className="nav-link">
              Features
            </a>
            <a href="#chains" className="nav-link">
              Chains
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/app" className="button-ghost hidden md:inline-flex">
              Open App
            </Link>
            <WalletMultiButton className="wallet-adapter-button wallet-adapter-button-trigger aura-wallet-button" />
          </div>
        </header>

        <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.08fr)_28rem] lg:items-stretch lg:py-18">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-200">
              <BadgeCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              Solana wallet modal, policy engine, encrypted execution
            </div>

            <div className="space-y-5">
              <h1 className="max-w-5xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
                Autonomous treasury agents need limits, not trust.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                AURA lets operators connect a real wallet, deploy actual treasury
                policy, and route agent-driven proposals through confidential
                guardrails before execution.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/app">
                Launch operator app
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                className="button-secondary"
                href="https://github.com/exyreams/aura"
                target="_blank"
                rel="noreferrer"
              >
                Read the repo
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {proofPoints.map((item) => (
                <article key={item.label} className="glass-panel p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <aside className="glass-panel landing-preview p-6">
            <div className="landing-preview-grid" aria-hidden="true" />
            <div className="relative space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Live operator snapshot
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    The app starts with the connected wallet and deployed program.
                  </p>
                </div>
                <span className="status-active">
                  <span className="status-dot bg-success" />
                  Devnet
                </span>
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Program
                    </p>
                    <p className="mt-2 font-mono text-sm text-slate-100">
                      {AURA_PROGRAM_ID.toBase58()}
                    </p>
                  </div>
                  <div className="metric-badge">
                    <Radar className="h-4 w-4" aria-hidden="true" />
                    Healthy
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-400">Daily policy spend</span>
                      <span className="font-mono text-sm text-white">
                        {formatCurrency(68240)} / {formatCurrency(95000)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full w-[72%] rounded-full bg-[linear-gradient(90deg,var(--accent),var(--primary))]" />
                    </div>
                  </div>

                  {signalCards.map((card) => (
                    <div
                      key={card.title}
                      className="rounded-[1.25rem] border border-white/8 bg-white/4 p-4"
                    >
                      <p className="text-sm font-semibold text-white">{card.title}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-400">
                        {card.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section id="flow" className="page-shell py-10 md:py-14">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-4">
            <p className="eyebrow">Execution Flow</p>
            <h2 className="section-title">
              Operator-first control from wallet connect to final execution.
            </h2>
            <p className="section-copy">
              The agent can propose actions, but it does not get an unrestricted
              signing path. AURA keeps the operator, policy engine, and execution
              service in the loop.
            </p>
          </div>

          <div className="grid gap-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="glass-panel flex gap-4 p-5 md:p-6">
                  <div className="landing-step-index">{`0${index + 1}`}</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="landing-icon">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    </div>
                    <p className="text-sm leading-7 text-slate-400">{step.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="page-shell py-10 md:py-14">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Feature Surface</p>
            <h2 className="section-title">Built for real operators, not mock treasury demos.</h2>
          </div>
          <Link href="/app" className="button-secondary">
            Open dashboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureHighlights.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="glass-panel p-6">
                <div className="landing-icon">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="chains" className="page-shell py-10 md:py-14">
        <div className="glass-panel p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow">Execution Networks</p>
              <h2 className="section-title">Chain-aware policy routing without hiding the operator context.</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              Solana remains the settlement anchor while dWallet-backed external execution
              lanes extend the treasury surface to the chains your agents already monitor.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supportedChains.map((chain) => (
              <article
                key={chain.name}
                className="rounded-[1.5rem] border border-white/8 bg-white/4 p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="landing-icon">
                    {chain.name === "Solana" ? (
                      <Waves className="h-5 w-5" aria-hidden="true" />
                    ) : chain.name === "Bitcoin" ? (
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">{chain.name}</p>
                    <p className="text-sm text-slate-400">{chain.status}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="page-shell pt-6">
        <div className="glass-panel flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-base font-semibold text-white">AURA</p>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Policy-aware AI treasury operations on Solana with confidential guardrails,
              dWallet-backed approvals, and explicit operator control.
            </p>
          </div>
          <div className="text-sm text-slate-300">
            <p>Program ID</p>
            <p className="mt-2 font-mono text-slate-100">
              {AURA_PROGRAM_ID.toBase58()}
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
