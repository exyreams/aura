"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Key,
  KeyRound,
  Lock,
  Network,
  PenLine,
  ScanSearch,
  Send,
  ShieldCheck,
  TrendingUp,
  UnlockKeyhole,
  Zap,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import { useTheme } from "next-themes";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Avatar, Badge, Progress, Tooltip } from "@/components/global";
import { Table, type TableColumn } from "@/components/global/Table";
import { CompactThemeToggle } from "@/components/theme/CompactThemeToggle";

// Slide data

const SLIDES = [
  {
    id: "title",
    label: "01 / Title",
  },
  {
    id: "problem",
    label: "02 / Problem",
  },
  {
    id: "why-now",
    label: "03 / Why Now",
  },
  {
    id: "solution",
    label: "04 / Solution",
  },
  {
    id: "how-it-works",
    label: "05 / How It Works",
  },
  {
    id: "policy-engine",
    label: "06 / Policy Engine",
  },
  {
    id: "multi-chain",
    label: "07 / Multi-Chain",
  },
  {
    id: "traction",
    label: "08 / Traction",
  },
  {
    id: "market",
    label: "09 / Market",
  },
  {
    id: "competition",
    label: "10 / Competition",
  },
  {
    id: "team",
    label: "11 / Team",
  },
  {
    id: "ask",
    label: "12 / Ask",
  },
];

// ─── Streaming background ──────────────────────────────────────────────────────

// ─── Slide components ──────────────────────────────────────────────────────────

const CHAINS = [
  { name: "Solana", logo: "/assets/solana.svg" },
  { name: "Bitcoin", logo: "/assets/bitcoin.svg" },
  { name: "Ethereum", logo: "/assets/ethereum.svg" },
  { name: "Polygon", logo: "/assets/polygon.svg" },
  { name: "Arbitrum", logo: "/assets/arbitrum.svg" },
  { name: "Optimism", logo: "/assets/optimism.svg" },
];

const STATS = [
  {
    value: "6",
    label: "Chains",
    icon: <Network size={80} strokeWidth={0.75} />,
  },
  {
    value: "27",
    label: "Policy rules",
    icon: <ShieldCheck size={80} strokeWidth={0.75} />,
  },
  {
    value: "FHE",
    label: "Encrypted",
    icon: <Lock size={80} strokeWidth={0.75} />,
  },
  {
    value: "60+",
    label: "Instructions",
    icon: <Zap size={80} strokeWidth={0.75} />,
  },
];

function SlideTitle() {
  const { resolvedTheme } = useTheme();
  const mountedRef = useRef(false);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    mountedRef.current = true;
    forceUpdate((n) => n + 1);
  }, []);

  const logoSrc =
    !mountedRef.current || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  return (
    <div className="flex flex-col h-full gap-4 md:gap-8">
      {/* Two-column layout — stacks on mobile */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-start md:items-center min-h-0">
        {/* Left — logo + tagline + chain badges */}
        <div className="flex flex-col gap-3 md:gap-6">
          <Badge variant="default" className="w-fit text-[9px] md:text-[10px]">
            Colosseum Frontier 2026
          </Badge>

          <div className="w-fit">
            <Image
              src={logoSrc}
              alt="AURA"
              width={300}
              height={78}
              className="w-auto h-8 md:h-14 lg:h-20"
              suppressHydrationWarning
            />
          </div>

          <p className="text-sm md:text-lg xl:text-xl text-(--text-muted) font-light leading-relaxed max-w-sm">
            Your AI agent moves funds on Bitcoin, Ethereum, and Solana — from
            one Solana program — without holding raw keys. Spending limits stay
            encrypted. Nobody can game them.
          </p>

          {/* Chain badges */}
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {CHAINS.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-0.5 md:py-1 border border-border bg-(--card-bg) rounded-sm font-mono text-[9px] md:text-[10px] text-(--text-muted) uppercase tracking-wide"
              >
                <Image
                  src={c.logo}
                  alt={c.name}
                  width={12}
                  height={12}
                  className="w-2.5 h-2.5 md:w-3 md:h-3 object-contain"
                />
                {c.name}
              </span>
            ))}
          </div>
        </div>

        {/* Right — stat block */}
        <div className="grid grid-cols-2 gap-2 md:gap-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 flex flex-col gap-0.5 md:gap-1 hover:border-primary transition-colors"
            >
              <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
                {s.icon}
              </div>
              <span className="font-mono font-extrabold text-xl md:text-3xl text-(--text-main) leading-none">
                {s.value}
              </span>
              <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest text-(--text-muted)">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border pt-3 md:pt-4 flex items-center justify-between flex-wrap gap-2 shrink-0">
        <span className="font-mono text-[9px] md:text-[10px] text-(--text-muted) uppercase tracking-widest">
          aura-protocol / devnet live
        </span>
        <span className="font-mono text-[9px] md:text-[10px] text-primary break-all">
          EaRoLVwL8EErDUeEMPHJ5QJeLVQZWJMtZcgmFzT9bhHs
        </span>
      </div>
    </div>
  );
}

function SlideProblem() {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          The Problem
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          AI agents are moving real money.
          <br />
          <span className="text-(--text-muted) font-light">
            The guardrails don&apos;t exist yet.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          four failure modes. one solution.
        </p>
      </div>
      {/* 2×2 grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 md:gap-4 min-h-0">
        {/* Raw key exposure */}
        <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 flex flex-col gap-1.5 md:gap-3 hover:border-primary transition-colors">
          <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
            <Key size={80} strokeWidth={0.75} />
          </div>
          <div className="text-primary">
            <Key size={14} className="md:hidden" />
            <Key size={18} className="hidden md:block" />
          </div>
          <div className="font-mono font-bold text-[10px] md:text-xs uppercase tracking-wide text-(--text-main)">
            Raw key exposure
          </div>
          <p className="font-mono text-[9px] md:text-xs text-(--text-muted) leading-relaxed">
            Giving an AI agent a private key means it can drain everything. No
            limits, no audit trail, no recovery.
          </p>
        </div>

        {/* Strategy on-chain */}
        <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 flex flex-col gap-1.5 md:gap-3 hover:border-primary transition-colors">
          <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
            <BookOpen size={80} strokeWidth={0.75} />
          </div>
          <div className="text-primary">
            <BookOpen size={14} className="md:hidden" />
            <BookOpen size={18} className="hidden md:block" />
          </div>
          <div className="font-mono font-bold text-[10px] md:text-xs uppercase tracking-wide text-(--text-main)">
            Strategy on-chain
          </div>
          <p className="font-mono text-[9px] md:text-xs text-(--text-muted) leading-relaxed">
            Public spending limits are public attack surface. Adversaries read
            your daily cap and probe exactly up to it.
          </p>
        </div>

        {/* Single-chain prison */}
        <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 flex flex-col gap-1.5 md:gap-3 hover:border-primary transition-colors">
          <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
            <Globe size={80} strokeWidth={0.75} />
          </div>
          <div className="text-primary">
            <Globe size={14} className="md:hidden" />
            <Globe size={18} className="hidden md:block" />
          </div>
          <div className="font-mono font-bold text-[10px] md:text-xs uppercase tracking-wide text-(--text-main)">
            Single-chain prison
          </div>
          <p className="font-mono text-[9px] md:text-xs text-(--text-muted) leading-relaxed">
            Most agent wallets are Solana-only. Real portfolios span Bitcoin,
            Ethereum, Arbitrum — agents can&apos;t reach them without bridges.
          </p>
        </div>

        {/* No kill switch */}
        <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 flex flex-col gap-1.5 md:gap-3 hover:border-primary transition-colors">
          <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
            <AlertTriangle size={80} strokeWidth={0.75} />
          </div>
          <div className="text-primary">
            <AlertTriangle size={14} className="md:hidden" />
            <AlertTriangle size={18} className="hidden md:block" />
          </div>
          <div className="font-mono font-bold text-[10px] md:text-xs uppercase tracking-wide text-(--text-main)">
            No kill switch
          </div>
          <p className="font-mono text-[9px] md:text-xs text-(--text-muted) leading-relaxed">
            When an agent misbehaves there&apos;s no circuit breaker, no
            guardian override, no emergency shutdown.
          </p>
        </div>
      </div>
    </div>
  );
}

import {
  AreaChart,
  Line,
  LineChart,
  Area as RArea,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";

function SlideWhyNow() {
  // DWF Ventures Apr 2026 — AI agents share of on-chain DeFi activity
  const activityData = [
    { v: 2 },
    { v: 3 },
    { v: 5 },
    { v: 8 },
    { v: 11 },
    { v: 15 },
    { v: 17 },
    { v: 19 },
  ];
  // Agentscan / KuCoin Mar 2026 — on-chain AI agents deployed Jan→Mar 2026
  const agentData = [
    { v: 3300 },
    { v: 8000 },
    { v: 22000 },
    { v: 45000 },
    { v: 78000 },
    { v: 105000 },
    { v: 118000 },
    { v: 123000 },
  ];
  const tip = {
    contentStyle: {
      backgroundColor: "var(--card-bg)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      fontSize: "10px",
      fontFamily: "monospace",
      color: "var(--text-main)",
    },
    cursor: false as const,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Why Now
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Three things just became true
          <br />
          <span className="text-(--text-muted) font-light">
            at the same time.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          agent adoption exploded. ika went live. the window is open.
        </p>
      </div>

      {/* Mobile: 4 stat cards stacked. Desktop: bento with charts */}
      <div className="flex-1 min-h-0">
        {/* ── Mobile layout ── */}
        <div className="flex flex-col gap-2 md:hidden h-full">
          {[
            {
              label: "AI agents — DeFi activity",
              value: "19%",
              sub: "↑ from 2% in 2023 · DWF Ventures Apr 2026",
              icon: <TrendingUp size={60} strokeWidth={0.75} />,
            },
            {
              label: "On-chain AI agents",
              value: "123K+",
              sub: "+3,600% since Jan 2026 · Agentscan / KuCoin",
              icon: <Zap size={60} strokeWidth={0.75} />,
            },
            {
              label: "dWallet network",
              value: "Ika mainnet",
              sub: "Zero-trust threshold signing on Solana is live.",
              icon: <Network size={60} strokeWidth={0.75} />,
            },
            {
              label: "McKinsey projection",
              value: "$3–5T",
              sub: "Agent commerce by 2030 — more than crypto market cap.",
              icon: <Clock size={60} strokeWidth={0.75} />,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 flex items-center gap-3 hover:border-primary transition-colors"
            >
              <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
                {s.icon}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[9px] text-(--text-muted) uppercase tracking-widest mb-0.5">
                  {s.label}
                </div>
                <div className="font-mono font-extrabold text-xl text-(--text-main) leading-none">
                  {s.value}
                </div>
                <div className="font-mono text-[9px] text-success mt-0.5">
                  {s.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop layout — bento with charts ── */}
        <div className="hidden md:grid md:grid-cols-3 md:grid-rows-2 gap-3 h-full">
          {/* Area chart — DeFi activity — row 1, cols 1-2 */}
          <div className="col-span-2 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col hover:border-primary transition-colors">
            <div className="flex items-start justify-between mb-2 shrink-0">
              <div>
                <div className="font-mono text-[10px] text-(--text-muted) uppercase tracking-widest">
                  AI agents — DeFi activity
                </div>
                <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none mt-0.5">
                  19%
                </div>
              </div>
              <span className="font-mono text-[10px] text-success">
                ↑ from 2% in 2023
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={activityData}
                  margin={{ top: 2, right: 2, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#9ca3b0"
                        stopOpacity={0.35}
                      />
                      <stop offset="100%" stopColor="#9ca3b0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <RechartTooltip
                    {...tip}
                    formatter={(v) => [`${v ?? 0}%`, "Activity"]}
                  />
                  <RArea
                    type="monotone"
                    dataKey="v"
                    stroke="#9ca3b0"
                    strokeWidth={2}
                    fill="url(#actGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ika mainnet */}
          <div className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col gap-1.5 hover:border-primary transition-colors">
            <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
              <Network size={60} strokeWidth={0.75} />
            </div>
            <div className="font-mono text-[10px] text-(--text-muted) uppercase tracking-widest">
              dWallet network
            </div>
            <div className="text-lg font-extrabold text-(--text-main) font-mono leading-none">
              Ika mainnet
            </div>
            <p className="text-(--text-muted) text-[10px] leading-relaxed">
              Zero-trust threshold signing on Solana is live. AURA couldn&apos;t
              exist without it.
            </p>
          </div>

          {/* McKinsey */}
          <div className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col gap-1.5 hover:border-primary transition-colors">
            <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
              <Clock size={60} strokeWidth={0.75} />
            </div>
            <div className="font-mono text-[10px] text-(--text-muted) uppercase tracking-widest">
              McKinsey projection
            </div>
            <div className="text-lg font-extrabold text-(--text-main) font-mono leading-none">
              $3–5T
            </div>
            <p className="text-(--text-muted) text-[10px] leading-relaxed">
              Agent commerce by 2030 — more than the entire current crypto
              market cap.
            </p>
          </div>

          {/* Line chart — agent count */}
          <div className="col-span-2 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col hover:border-primary transition-colors">
            <div className="flex items-start justify-between mb-2 shrink-0">
              <div>
                <div className="font-mono text-[10px] text-(--text-muted) uppercase tracking-widest">
                  On-chain AI agents deployed
                </div>
                <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none mt-0.5">
                  123K+
                </div>
              </div>
              <span className="font-mono text-[10px] text-success">
                +3,600% since Jan 2026
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={agentData}
                  margin={{ top: 2, right: 2, bottom: 0, left: 0 }}
                >
                  <RechartTooltip
                    {...tip}
                    formatter={(v) => [
                      Number(v ?? 0).toLocaleString(),
                      "Agents",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#9ca3b0"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideSolution() {
  const pillars = [
    {
      num: "01",
      title: "Multi-chain reach",
      body: "One Solana program controls assets on Bitcoin, Ethereum, Polygon, Arbitrum, and Optimism via Ika dWallet. No bridges. No custodians. The agent never holds a private key on any chain.",
      tag: "aura-core",
      icon: <Globe size={120} strokeWidth={0.75} />,
    },
    {
      num: "02",
      title: "FHE policy storage",
      body: "Daily limits, per-tx caps, and running spend counters are FHE ciphertexts. Policy evaluation runs over encrypted values via Ika Encrypt — only an encrypted violation code comes out. Limits are unreadable on-chain.",
      tag: "aura-policy",
      icon: <Lock size={120} strokeWidth={0.75} />,
    },
    {
      num: "03",
      title: "27-rule public engine",
      body: "Time windows, velocity, oracle-powered slippage and quote freshness, protocol allowlists, counterparty risk, anomaly detection, approval ladders, scoped pauses, swarm shared pools — all evaluated publicly before FHE.",
      tag: "aura-policy",
      icon: <ShieldCheck size={120} strokeWidth={0.75} />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          The Solution
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Encrypted guardrails.
          <br />
          <span className="text-(--text-muted) font-light">
            No raw keys. No exposed limits.
            <br />
            Any chain.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          three pillars. each solves one of the four problems.
        </p>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
        {pillars.map((item) => (
          <div
            key={item.num}
            className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-6 flex flex-row md:flex-col gap-3 md:gap-0 hover:border-primary transition-colors"
          >
            <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.05] pointer-events-none select-none hidden md:block">
              {item.icon}
            </div>
            {/* Mobile: number badge on left */}
            <div className="font-mono text-primary text-sm font-bold md:mb-4 shrink-0 md:shrink">
              {item.num}
            </div>
            <div className="flex flex-col gap-1 md:gap-0 flex-1 min-w-0">
              <div className="font-bold text-(--text-main) text-[10px] md:text-sm uppercase tracking-wide font-mono md:mb-3">
                {item.title}
              </div>
              <p className="text-(--text-muted) text-[9px] md:text-sm leading-relaxed md:flex-1 line-clamp-3 md:line-clamp-none">
                {item.body}
              </p>
              <div className="mt-2 md:mt-5">
                <Badge variant="active" className="text-[8px] md:text-[10px]">
                  {item.tag}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideHowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Agent proposes",
      detail: (
        <>
          AI authority submits{" "}
          <code className="font-mono text-success text-[10px]">
            propose_transaction
          </code>{" "}
          or{" "}
          <code className="font-mono text-success text-[10px]">
            propose_confidential_transaction
          </code>{" "}
          to aura-core on Solana.
        </>
      ),
      icon: <Send size={80} strokeWidth={0.75} />,
      fg: <Send size={16} className="text-primary" />,
      highlight: false,
    },
    {
      step: "02",
      title: "Public pre-check",
      detail: (
        <>
          aura-policy evaluates 25 public rules: velocity, oracle-powered
          slippage + quote freshness, protocol bitmap, time windows, anomaly
          detection.
        </>
      ),
      icon: <ScanSearch size={80} strokeWidth={0.75} />,
      fg: <ScanSearch size={16} className="text-primary" />,
      highlight: false,
    },
    {
      step: "03",
      title: "FHE evaluation",
      detail: (
        <>
          Encrypted amount evaluated against encrypted limits via Ika Encrypt.
          Only a violation code ciphertext is produced — the amount never
          appears in plaintext.
        </>
      ),
      icon: <KeyRound size={80} strokeWidth={0.75} />,
      fg: <KeyRound size={16} className="text-primary" />,
      highlight: true,
    },
    {
      step: "04",
      title: "Decrypt result",
      detail: (
        <>
          <code className="font-mono text-success text-[10px]">
            request_policy_decryption
          </code>{" "}
          →{" "}
          <code className="font-mono text-success text-[10px]">
            confirm_policy_decryption
          </code>
          . 0 = approved.{" "}
          <code className="font-mono text-success text-[10px]">
            spent_today
          </code>{" "}
          ciphertext updated in-place.
        </>
      ),
      icon: <UnlockKeyhole size={80} strokeWidth={0.75} />,
      fg: <UnlockKeyhole size={16} className="text-primary" />,
      highlight: false,
    },
    {
      step: "05",
      title: "dWallet signs",
      detail: (
        <>
          <code className="font-mono text-success text-[10px]">
            execute_pending
          </code>{" "}
          submits{" "}
          <code className="font-mono text-success text-[10px]">
            approve_message
          </code>{" "}
          CPI. Ika 2PC-MPC network co-signs the chain message asynchronously.
        </>
      ),
      icon: <PenLine size={80} strokeWidth={0.75} />,
      fg: <PenLine size={16} className="text-primary" />,
      highlight: false,
    },
    {
      step: "06",
      title: "Finalize",
      detail: (
        <>
          <code className="font-mono text-success text-[10px]">
            finalize_execution
          </code>{" "}
          verifies the MessageApproval account, records the receipt, and marks
          the proposal Executed on the target chain.
        </>
      ),
      icon: <CheckCircle2 size={80} strokeWidth={0.75} />,
      fg: <CheckCircle2 size={16} className="text-primary" />,
      highlight: false,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          How It Works
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Six steps from proposal
          <br />
          <span className="text-(--text-muted) font-light">
            to multi-chain execution.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          step 3 is the key insight — the amount never appears in plaintext.
        </p>
      </div>
      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 min-h-0">
        {steps.map((s) => (
          <div
            key={s.step}
            className={`relative overflow-hidden rounded p-3 md:p-5 flex flex-col gap-1.5 md:gap-2 transition-colors border ${
              s.highlight
                ? "border-primary bg-(--card-bg)"
                : "border-border bg-(--card-bg) hover:border-primary"
            }`}
          >
            {/* Ghost icon — hidden on mobile to save space */}
            <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.05] pointer-events-none select-none hidden md:block">
              {s.icon}
            </div>
            {/* Step number + icon row */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] md:text-[10px] text-primary font-bold">
                {s.step}
              </span>
              <span className="md:block">{s.fg}</span>
            </div>
            <div className="font-bold text-(--text-main) text-[10px] md:text-xs uppercase tracking-wide font-mono">
              {s.title}
            </div>
            {/* On mobile: clamp to 3 lines to prevent overflow */}
            <p className="text-(--text-muted) text-[9px] md:text-xs leading-relaxed line-clamp-4 md:line-clamp-none">
              {s.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlidePolicyEngine() {
  const categories = [
    {
      label: "Spend limits",
      rules: [
        {
          code: "per_transaction_limit",
          desc: "Amount exceeded the per-transaction USD cap",
        },
        {
          code: "daily_limit",
          desc: "Projected daily spend would exceed the effective daily limit",
        },
        {
          code: "weekly_limit",
          desc: "Projected 7-day spend would exceed the weekly limit",
        },
        {
          code: "monthly_limit",
          desc: "Projected 30-day spend would exceed the monthly limit",
        },
      ],
    },
    {
      label: "Time & velocity",
      rules: [
        {
          code: "time_window_limit",
          desc: "Projected hourly spend would exceed the active daytime/nighttime limit",
        },
        {
          code: "velocity_limit",
          desc: "Recent-amounts velocity window sum would exceed the velocity cap",
        },
        {
          code: "cooldown_not_elapsed",
          desc: "Minimum delay between large transactions has not elapsed",
        },
      ],
    },
    {
      label: "Protocol & counterparty",
      rules: [
        {
          code: "protocol_not_allowed",
          desc: "Protocol ID is not set in the allowed_protocol_bitmap",
        },
        {
          code: "counterparty_risk",
          desc: "Counterparty risk score exceeded the configured maximum",
        },
        {
          code: "slippage_exceeded",
          desc: "Computed slippage exceeded max_slippage_bps",
        },
        {
          code: "quote_stale",
          desc: "Quote age exceeded max_quote_age_secs — price data is too old",
        },
      ],
    },
    {
      label: "Recipient exposure",
      rules: [
        {
          code: "recipient_daily_limit",
          desc: "Recipient-specific daily exposure would be exceeded",
        },
        {
          code: "recipient_per_transaction_limit",
          desc: "Recipient-specific per-transaction exposure would be exceeded",
        },
        {
          code: "shared_pool_limit",
          desc: "Projected swarm pool spend would exceed the shared pool cap",
        },
        {
          code: "exposure_group_limit_exceeded",
          desc: "Cross-treasury exposure group cap would be exceeded",
        },
      ],
    },
    {
      label: "Budget envelopes",
      rules: [
        {
          code: "budget_envelope_daily_limit",
          desc: "A scoped budget envelope daily cap would be exceeded",
        },
        {
          code: "budget_envelope_weekly_limit",
          desc: "A scoped budget envelope weekly cap would be exceeded",
        },
      ],
    },
    {
      label: "Governance & safety",
      rules: [
        {
          code: "approval_ladder_denied",
          desc: "Approval ladder denied the transaction based on amount or risk score",
        },
        {
          code: "execution_scope_paused",
          desc: "A scoped pause is active for this chain or transaction type",
        },
        {
          code: "pending_execution_timelock_active",
          desc: "Pending execution timelock is still active",
        },
        {
          code: "external_dependency_stale",
          desc: "Required external dependency liveness signal is stale",
        },
        {
          code: "policy_attestation_missing",
          desc: "Policy attestation is missing or has expired",
        },
        {
          code: "bitcoin_manual_review",
          desc: "Bitcoin transaction exceeded the manual review threshold",
        },
        {
          code: "anomaly_detected",
          desc: "Statistical anomaly detection flagged the amount as an outlier",
        },
        { code: "empty_batch", desc: "Batch proposal contained no items" },
        {
          code: "batch_too_large",
          desc: "Batch proposal exceeded the maximum item count",
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Policy Engine
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          27 violation codes.
          <br />
          <span className="text-(--text-muted) font-light">
            Evaluated in microseconds, on-chain.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          hover any badge to see what it enforces.
        </p>
      </div>
      <div className="flex-1 flex flex-col justify-between min-h-0 overflow-hidden">
        {/* Mobile: summary + stat cards only */}
        <div className="flex flex-col gap-2 md:hidden">
          <div className="border border-border bg-(--card-bg) rounded p-3">
            <div className="font-mono text-[9px] text-(--text-muted) mb-2">
              27 violation codes across 6 categories:
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                "spend limits",
                "time & velocity",
                "protocol & counterparty",
                "recipient exposure",
                "budget envelopes",
                "governance & safety",
              ].map((c) => (
                <Badge
                  key={c}
                  variant="default"
                  className="text-[8px] px-1.5 py-0.5"
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop: full badge cloud */}
        <div className="hidden md:flex flex-col gap-2.5 overflow-hidden min-h-0">
          {categories.map((cat) => (
            <div key={cat.label} className="flex items-start gap-1.5">
              <span className="font-mono text-[9px] text-(--text-muted) uppercase tracking-widest w-28 shrink-0 pt-1">
                {cat.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {cat.rules.map((r) => (
                  <Tooltip key={r.code} content={r.desc}>
                    <Badge
                      variant="default"
                      className="cursor-default hover:border-primary hover:text-primary transition-colors text-[9px] px-2 py-1"
                    >
                      {r.code}
                    </Badge>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 shrink-0">
          {[
            {
              value: "25",
              label: "Public rules",
              sub: "oracle-powered: quote freshness, slippage, velocity",
              icon: <ScanSearch size={70} strokeWidth={0.75} />,
            },
            {
              value: "2",
              label: "FHE rules",
              sub: "per-tx + daily limits evaluated over encrypted values",
              icon: <KeyRound size={70} strokeWidth={0.75} />,
            },
            {
              value: "✓",
              label: "Reputation scaling",
              sub: "daily limit multiplier based on agent track record",
              icon: <ShieldCheck size={70} strokeWidth={0.75} />,
            },
          ].map((m) => (
            <div
              key={m.label}
              className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-4 flex flex-col gap-1 hover:border-primary transition-colors"
            >
              <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.05] pointer-events-none select-none">
                {m.icon}
              </div>
              <div className="font-mono font-extrabold text-xl md:text-2xl text-(--text-main) leading-none">
                {m.value}
              </div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-(--text-main)">
                {m.label}
              </div>
              <div className="font-mono text-[10px] text-(--text-muted) leading-relaxed">
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideMultiChain() {
  const chains = [
    {
      name: "Bitcoin",
      logo: "/assets/bitcoin.svg",
      curve: "Secp256k1",
      scheme: "ECDSA",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
    {
      name: "Ethereum",
      logo: "/assets/ethereum.svg",
      curve: "Secp256k1",
      scheme: "ECDSA / Keccak256",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
    {
      name: "Solana",
      logo: "/assets/solana.svg",
      curve: "Ed25519",
      scheme: "EdDSA",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
    {
      name: "Polygon",
      logo: "/assets/polygon.svg",
      curve: "Secp256k1",
      scheme: "ECDSA",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
    {
      name: "Arbitrum",
      logo: "/assets/arbitrum.svg",
      curve: "Secp256k1",
      scheme: "ECDSA",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
    {
      name: "Optimism",
      logo: "/assets/optimism.svg",
      curve: "Secp256k1",
      scheme: "ECDSA",
      ghost: <Globe size={80} strokeWidth={0.75} />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Multi-Chain Execution
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          One treasury.
          <br />
          <span className="text-(--text-muted) font-light">
            Six chains. No bridges.
          </span>
        </h2>
        <p className="font-mono text-[10px] md:text-xs text-(--text-muted) mt-1.5 md:mt-2">
          one dwallet per chain. 2pc-mpc dkg. the agent never touches a private
          key.
        </p>
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-4">
          {chains.map((c) => (
            <div
              key={c.name}
              className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-4 flex items-center gap-3 hover:border-primary transition-colors"
            >
              <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
                {c.ghost}
              </div>
              <Image
                src={c.logo}
                alt={c.name}
                width={28}
                height={28}
                className="w-7 h-7 object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="font-bold text-(--text-main) text-xs md:text-sm leading-none mb-1">
                  {c.name}
                </div>
                <div className="font-mono text-[10px] text-(--text-muted)">
                  {c.curve}
                </div>
                <div className="font-mono text-[10px] text-(--accent)">
                  {c.scheme}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 md:p-5 hover:border-primary transition-colors">
          <div className="absolute -bottom-4 -right-4 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
            <Network size={120} strokeWidth={0.75} />
          </div>
          <div className="font-mono text-xs text-primary mb-2 uppercase tracking-widest">
            How it works
          </div>
          <p className="text-(--text-muted) text-[10px] md:text-sm leading-relaxed">
            Each treasury registers one dWallet per chain. The dWallet holds key
            material via Ika&apos;s 2PC-MPC DKG — no single party ever has the
            full key. When a proposal is approved,{" "}
            <code className="font-mono text-success text-xs">
              execute_pending
            </code>{" "}
            submits an{" "}
            <code className="font-mono text-success text-xs">
              approve_message
            </code>{" "}
            CPI. The Ika network co-signs asynchronously. The agent never
            touches a private key.
          </p>
        </div>
      </div>
    </div>
  );
}

function SlideTraction() {
  const items = [
    {
      label: "On-chain program",
      value: "Live on devnet",
      sub: "EaRoLVwL8EErDUeEMPHJ5QJeLVQZWJMtZcgmFzT9bhHs",
      highlight: true,
      icon: <CheckCircle2 size={80} strokeWidth={0.75} />,
    },
    {
      label: "Instruction surface",
      value: "60+",
      sub: "handlers across treasury, policy, governance, execution, safety",
      highlight: false,
      icon: <Zap size={80} strokeWidth={0.75} />,
    },
    {
      label: "Policy rules",
      value: "27",
      sub: "violation codes, 25 public + 2 FHE-encrypted",
      highlight: false,
      icon: <ShieldCheck size={80} strokeWidth={0.75} />,
    },
    {
      label: "SDK coverage",
      value: "TypeScript + Rust",
      sub: "sdk-ts (120 unit tests) + sdk-rs with full instruction builders",
      highlight: false,
      icon: <Network size={80} strokeWidth={0.75} />,
    },
    {
      label: "CLI",
      value: "Full surface",
      sub: "treasury, dwallet, confidential, execution, governance, pda, features",
      highlight: false,
      icon: <Send size={80} strokeWidth={0.75} />,
    },
    {
      label: "Backend service",
      value: "Node HTTP",
      sub: "SIWS auth, SQLite, encrypted keypairs, agent loop, gRPC bridge",
      highlight: false,
      icon: <Lock size={80} strokeWidth={0.75} />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Traction
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Working product.
          <br />
          <span className="text-(--text-muted) font-light">
            Not a whitepaper.
          </span>
        </h2>
      </div>
      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 content-center">
        {items.map((item) => (
          <div
            key={item.label}
            className={`relative overflow-hidden rounded p-3 md:p-5 flex flex-col gap-2 transition-colors border ${
              item.highlight
                ? "border-primary bg-(--card-bg)"
                : "border-border bg-(--card-bg) hover:border-primary"
            }`}
          >
            <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
              {item.icon}
            </div>
            <div className="font-mono text-[9px] md:text-[10px] text-(--text-muted) uppercase tracking-widest">
              {item.label}
            </div>
            <div className="font-mono font-bold text-(--text-main) text-sm md:text-base leading-snug">
              {item.value}
            </div>
            <p className="font-mono text-[9px] md:text-[10px] text-(--text-muted) leading-relaxed break-all">
              {item.sub}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideMarket() {
  const users = [
    {
      label: "DeFi trading agents",
      icon: <TrendingUp size={14} />,
      desc: "Automated yield, arbitrage, and liquidity strategies across chains",
    },
    {
      label: "AI portfolio managers",
      icon: <ShieldCheck size={14} />,
      desc: "Autonomous rebalancing and risk management for on-chain portfolios",
    },
    {
      label: "Autonomous DAOs",
      icon: <Network size={14} />,
      desc: "Treasury execution without human approval on every transaction",
    },
    {
      label: "Agent swarms",
      icon: <Zap size={14} />,
      desc: "Coordinated multi-agent systems sharing a capped spending pool",
    },
    {
      label: "Cross-chain yield bots",
      icon: <Globe size={14} />,
      desc: "Bots that move capital across Bitcoin, Ethereum, Solana and more",
    },
    {
      label: "Institutional AI desks",
      icon: <Lock size={14} />,
      desc: "Compliance-aware agents with audit trails and guardian overrides",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Market
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Every AI agent
          <br />
          <span className="text-(--text-muted) font-light">
            that touches money needs this.
          </span>
        </h2>
      </div>

      {/* Mobile: simple stacked layout. Desktop: full bento */}
      <div className="flex-1 min-h-0">
        {/* ── Mobile layout ── */}
        <div className="flex flex-col gap-2 md:hidden h-full">
          {/* TAM */}
          <div className="relative overflow-hidden border border-primary bg-(--card-bg) rounded p-4 flex flex-col gap-1 hover:border-primary transition-colors">
            <div className="absolute -bottom-4 -right-4 text-(--text-main) opacity-[0.06] pointer-events-none select-none">
              <Clock size={100} strokeWidth={0.5} />
            </div>
            <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
              TAM
            </div>
            <div className="font-mono font-extrabold text-4xl text-(--text-main) leading-none">
              $3–5T
            </div>
            <div className="font-mono text-[9px] text-(--text-muted)">
              AI agent commerce by 2030 — McKinsey
            </div>
          </div>
          {/* SAM + SOM side by side */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 flex flex-col gap-1 hover:border-primary transition-colors">
              <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
                SAM
              </div>
              <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none">
                $13.5B
              </div>
              <div className="font-mono text-[9px] text-(--text-muted)">
                AI agent token market cap peak
              </div>
            </div>
            <div className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 flex flex-col gap-1 hover:border-primary transition-colors">
              <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
                SOM
              </div>
              <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none">
                19%
              </div>
              <div className="font-mono text-[9px] text-(--text-muted)">
                of DeFi activity today
              </div>
            </div>
          </div>
          {/* Who needs AURA — compact badges */}
          <div className="border border-border bg-(--card-bg) rounded p-3">
            <div className="font-mono text-[9px] text-primary uppercase tracking-widest mb-2">
              Who needs AURA
            </div>
            <div className="flex flex-wrap gap-1">
              {users.map((u) => (
                <Badge
                  key={u.label}
                  variant="default"
                  className="text-[8px] px-1.5 py-0.5 flex items-center gap-1"
                >
                  <span className="text-primary">{u.icon}</span>
                  {u.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* ── Desktop layout — full bento ── */}
        <div className="hidden md:grid md:grid-cols-4 md:grid-rows-3 gap-3 h-full">
          {/* TAM — hero 2×2 */}
          <div className="col-span-2 row-span-2 relative overflow-hidden border border-primary bg-(--card-bg) rounded p-6 flex flex-col justify-center hover:border-primary transition-colors">
            <div className="absolute -bottom-8 -right-8 text-(--text-main) opacity-[0.06] pointer-events-none select-none">
              <Clock size={200} strokeWidth={0.5} />
            </div>
            <div className="font-mono text-[10px] text-primary uppercase tracking-widest mb-3">
              TAM
            </div>
            <div className="font-mono font-extrabold text-6xl text-(--text-main) leading-none mb-4">
              $3–5T
            </div>
            <div className="font-mono text-xs text-(--text-muted) leading-relaxed max-w-xs">
              AI agent commerce by 2030 — McKinsey.
              <br />
              More than the entire current crypto market cap.
            </div>
          </div>

          {/* SAM */}
          <div className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col justify-between hover:border-primary transition-colors">
            <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
              <TrendingUp size={60} strokeWidth={0.75} />
            </div>
            <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
              SAM
            </div>
            <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none">
              $13.5B
            </div>
            <div className="font-mono text-[9px] text-(--text-muted)">
              AI agent token market cap peak
            </div>
          </div>

          {/* SOM */}
          <div className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 flex flex-col justify-between hover:border-primary transition-colors">
            <div className="absolute -bottom-2 -right-2 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
              <Zap size={60} strokeWidth={0.75} />
            </div>
            <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
              SOM
            </div>
            <div className="font-mono font-extrabold text-2xl text-(--text-main) leading-none">
              19%
            </div>
            <div className="font-mono text-[9px] text-(--text-muted)">
              of DeFi activity today
            </div>
          </div>

          {/* User type cards — rows 2-3, right side */}
          {users.slice(0, 2).map((u) => (
            <div
              key={u.label}
              className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 flex flex-col gap-2 hover:border-primary transition-colors"
            >
              <span className="text-primary">{u.icon}</span>
              <div className="font-mono text-[9px] font-bold text-(--text-main) uppercase tracking-wide leading-tight">
                {u.label}
              </div>
              <p className="font-mono text-[9px] text-(--text-muted) leading-relaxed">
                {u.desc}
              </p>
            </div>
          ))}
          {users.slice(2, 6).map((u) => (
            <div
              key={u.label}
              className="col-span-1 row-span-1 relative overflow-hidden border border-border bg-(--card-bg) rounded p-3 flex flex-col gap-2 hover:border-primary transition-colors"
            >
              <span className="text-primary">{u.icon}</span>
              <div className="font-mono text-[9px] font-bold text-(--text-main) uppercase tracking-wide leading-tight">
                {u.label}
              </div>
              <p className="font-mono text-[9px] text-(--text-muted) leading-relaxed">
                {u.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideCompetition() {
  type CompRow = {
    name: string;
    fhe: string;
    multichain: string;
    noKey: string;
    publicRules: string;
    highlight: boolean;
  };

  const data: CompRow[] = [
    {
      name: "AURA",
      fhe: "✓",
      multichain: "✓ (6 chains)",
      noKey: "✓",
      publicRules: "27",
      highlight: true,
    },
    {
      name: "CloakedAgent",
      fhe: "✗",
      multichain: "EVM only",
      noKey: "✓",
      publicRules: "Basic",
      highlight: false,
    },
    {
      name: "Anchorage Agentic",
      fhe: "✗",
      multichain: "Fiat + crypto",
      noKey: "✗ (custodial)",
      publicRules: "Manual",
      highlight: false,
    },
    {
      name: "Squads / multisig",
      fhe: "✗",
      multichain: "Solana only",
      noKey: "✗ (key held)",
      publicRules: "Manual",
      highlight: false,
    },
    {
      name: "Safe (EVM)",
      fhe: "✗",
      multichain: "EVM only",
      noKey: "✗ (key held)",
      publicRules: "Manual",
      highlight: false,
    },
    {
      name: "Raw dWallet",
      fhe: "✗",
      multichain: "✓",
      noKey: "✓",
      publicRules: "None",
      highlight: false,
    },
  ];

  const columns: TableColumn<CompRow>[] = [
    {
      key: "name",
      header: "Protocol",
      render: (r) => (
        <span
          className={`font-mono text-xs font-bold ${r.highlight ? "text-primary" : "text-(--text-muted)"}`}
        >
          {r.name}
        </span>
      ),
    },
    {
      key: "fhe",
      header: "FHE limits",
      render: (r) => (
        <span
          className={`font-mono text-xs ${r.fhe === "✓" ? "text-success" : "text-(--text-muted)"}`}
        >
          {r.fhe}
        </span>
      ),
    },
    {
      key: "multichain",
      header: "Multi-chain",
      render: (r) => (
        <span
          className={`font-mono text-xs ${r.multichain === "✓" || r.multichain.startsWith("✓") ? "text-success" : "text-(--text-muted)"}`}
        >
          {r.multichain}
        </span>
      ),
    },
    {
      key: "noKey",
      header: "No raw key",
      render: (r) => (
        <span
          className={`font-mono text-xs ${r.noKey === "✓" ? "text-success" : "text-(--text-muted)"}`}
        >
          {r.noKey}
        </span>
      ),
    },
    {
      key: "publicRules",
      header: "Policy rules",
      render: (r) => (
        <span
          className={`font-mono text-xs ${r.highlight ? "text-primary font-bold" : "text-(--text-muted)"}`}
        >
          {r.publicRules}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Competition
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Nobody else combines
          <br />
          <span className="text-(--text-muted) font-light">
            FHE + dWallet + policy engine.
          </span>
        </h2>
      </div>
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {/* Mobile: card list */}
        <div className="flex flex-col gap-2 md:hidden">
          {data.map((r) => (
            <div
              key={r.name}
              className={`border rounded p-3 flex items-center gap-3 ${r.highlight ? "border-primary bg-(--card-bg)" : "border-border bg-(--card-bg)"}`}
            >
              <div className="flex-1 min-w-0">
                <div
                  className={`font-mono text-xs font-bold ${r.highlight ? "text-primary" : "text-(--text-muted)"}`}
                >
                  {r.name}
                </div>
                <div className="font-mono text-[9px] text-(--text-muted) mt-0.5">
                  {r.multichain}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <span
                  className={`font-mono text-[10px] ${r.fhe === "✓" ? "text-success" : "text-(--text-muted)"}`}
                >
                  {r.fhe}
                </span>
                <span
                  className={`font-mono text-[10px] ${r.noKey === "✓" ? "text-success" : "text-(--text-muted)"}`}
                >
                  {r.noKey}
                </span>
                <span
                  className={`font-mono text-[10px] ${r.highlight ? "text-primary font-bold" : "text-(--text-muted)"}`}
                >
                  {r.publicRules}
                </span>
              </div>
            </div>
          ))}
          <div className="flex gap-4 font-mono text-[8px] text-(--text-muted) px-1">
            <span>FHE · No key · Rules</span>
          </div>
        </div>

        {/* Desktop: full table */}
        <div
          className="hidden md:block overflow-x-auto -mx-2 px-2"
          data-no-swipe
        >
          <Table columns={columns} data={data} keyExtractor={(r) => r.name} />
        </div>

        <p className="font-mono text-[9px] md:text-[10px] text-(--text-muted) mt-4">
          The real competitor is &quot;doing nothing&quot; — agents running with
          raw keys and zero limits. That&apos;s the status quo we&apos;re
          replacing.
        </p>
      </div>
    </div>
  );
}

function SlideTeam() {
  const team = [
    {
      name: "exyreams",
      handle: "@exyreams",
      github: "https://github.com/exyreams",
      avatar: "https://github.com/exyreams.png",
      role: "Founder · Full-stack",
      scope:
        "aura-core · aura-policy · sdk-rs · sdk-ts · backend · CLI · web · docs",
      detail:
        "Built everything — Anchor program, FHE graph, policy engine, dWallet CPI, TypeScript SDK, Rust SDK, Node backend, CLI, Next.js dashboard, and docs site.",
      location: "Nepal",
    },
    {
      name: "exyness",
      handle: "@exyness",
      github: "https://github.com/exyness",
      avatar: "https://github.com/exyness.png",
      role: "Contributor",
      scope: "pitch · demo video · docs · design",
      detail:
        "Pitch deck, demo video production, documentation writing, and design contributions across the project.",
      location: "Nepal",
    },
  ];

  const shipped = [
    "anchor program (60+ instructions)",
    "pure-rust policy engine",
    "fhe graph via ika encrypt",
    "dwallet cpi integration",
    "typescript sdk (120 unit tests)",
    "rust sdk",
    "full cli",
    "node backend + siws auth",
    "next.js dashboard",
    "docs site",
    "pitch deck",
    "pitch video",
    "devnet live",
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          Team
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Built by people who
          <br />
          <span className="text-(--text-muted) font-light">
            read the Anchor source code for fun.
          </span>
        </h2>
      </div>
      <div className="flex-1 flex flex-col justify-between min-h-0">
        {/* Team cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4">
          {team.map((m) => (
            <div
              key={m.handle}
              className="relative overflow-hidden border border-border bg-(--card-bg) rounded p-4 md:p-5 flex flex-col gap-3 hover:border-primary transition-colors"
            >
              {/* Avatar + handle hero */}
              <div className="flex items-center gap-4">
                <Avatar name={m.name} src={m.avatar} size="large" />
                <a
                  href={m.github}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-bold text-base md:text-xl text-(--text-main) hover:text-primary transition-colors"
                >
                  {m.handle}
                </a>
              </div>

              {/* Scope */}
              <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
                {m.scope}
              </div>

              {/* Detail */}
              <p className="font-mono text-[9px] md:text-[10px] text-(--text-muted) leading-relaxed">
                {m.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Shipped grid */}
        <div className="border border-border bg-(--card-bg) rounded p-3 md:p-4 hover:border-primary transition-colors">
          <div className="font-mono text-[10px] text-primary uppercase tracking-widest mb-3">
            What we&apos;ve shipped
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shipped.map((item) => (
              <Badge
                key={item}
                variant="active"
                className="text-[8px] md:text-[9px] px-2 py-1"
              >
                {item}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideAsk() {
  const next = [
    {
      phase: "Now",
      title: "Win Frontier",
      detail:
        "Validation, $30K prize, and accelerator access. The FHE + dWallet sub-niche is effectively empty across 5,400+ prior submissions.",
      icon: <CheckCircle2 size={80} strokeWidth={0.75} />,
      highlight: true,
    },
    {
      phase: "Next",
      title: "Full agentic loop",
      detail:
        "Tighten the human-to-agent handoff — seamless onboarding from a normal treasury to a fully autonomous agent flow. Mainnet audit. Production hardening.",
      icon: <Network size={80} strokeWidth={0.75} />,
      highlight: false,
    },
    {
      phase: "Then",
      title: "Ecosystem",
      detail:
        "First protocol integrations. Ika mainnet. Agent swarm support GA. Conversations with builders and investors welcome — no promises, just momentum.",
      icon: <TrendingUp size={80} strokeWidth={0.75} />,
      highlight: false,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 md:mb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-2 md:mb-3">
          The Ask
        </div>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
          Win Frontier.
          <br />
          <span className="text-(--text-muted) font-light">
            Then build it right.
          </span>
        </h2>
      </div>
      <div className="flex-1 flex flex-col justify-between min-h-0">
        {/* Three-phase cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4">
          {next.map((n) => (
            <div
              key={n.phase}
              className={`relative overflow-hidden rounded p-4 md:p-5 flex flex-col gap-2 transition-colors border ${
                n.highlight
                  ? "border-primary bg-(--card-bg)"
                  : "border-border bg-(--card-bg) hover:border-primary"
              }`}
            >
              <div className="absolute -bottom-3 -right-3 text-(--text-main) opacity-[0.04] pointer-events-none select-none">
                {n.icon}
              </div>
              <div className="font-mono text-[9px] text-primary uppercase tracking-widest">
                {n.phase}
              </div>
              <div className="font-mono font-extrabold text-lg md:text-xl text-(--text-main) leading-none">
                {n.title}
              </div>
              <p className="font-mono text-[10px] text-(--text-muted) leading-relaxed">
                {n.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Hardest question prep */}
        <div className="border border-border bg-(--card-bg) rounded p-3 md:p-5 hover:border-primary transition-colors">
          <div className="font-mono text-[10px] text-primary mb-3 uppercase tracking-widest">
            Hardest question you&apos;ll ask
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
            {[
              {
                q: "Why Solana and not EVM?",
                a: "Ika dWallet is live on Solana. The multi-chain execution layer runs from here — Bitcoin, Ethereum, Polygon, Arbitrum, Optimism all reachable from one program.",
              },
              {
                q: "Is the FHE production-ready?",
                a: "Ika Encrypt is pre-alpha. We're building on the primitive as it matures — same bet as building on Solana in 2020.",
              },
              {
                q: "What if Ika doesn't ship mainnet?",
                a: "The public policy engine (27 rules) works without FHE. Confidential guardrails are additive, not load-bearing.",
              },
              {
                q: "How do you make money?",
                a: "Protocol fees on executed transactions. Every approved proposal that goes through AURA generates a small fee — no token needed.",
              },
            ].map((item) => (
              <div key={item.q} className="flex flex-col gap-1">
                <div className="font-mono text-[9px] font-bold text-(--text-main) uppercase tracking-wide">
                  {item.q}
                </div>
                <p className="font-mono text-[9px] text-(--text-muted) leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide map

const SLIDE_COMPONENTS: Record<string, () => React.ReactElement> = {
  title: SlideTitle,
  problem: SlideProblem,
  "why-now": SlideWhyNow,
  solution: SlideSolution,
  "how-it-works": SlideHowItWorks,
  "policy-engine": SlidePolicyEngine,
  "multi-chain": SlideMultiChain,
  traction: SlideTraction,
  market: SlideMarket,
  competition: SlideCompetition,
  team: SlideTeam,
  ask: SlideAsk,
};

// Main page

export default function PitchPage() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Read hash after mount to avoid SSR hydration mismatch
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const idx = SLIDES.findIndex((s) => s.id === hash);
    if (idx > 0) {
      setCurrent(idx);
    }
    setMounted(true);
  }, []);

  const prev = () => {
    if (current === 0) return;
    setDirection(-1);
    setCurrent((c) => c - 1);
  };

  const next = () => {
    if (current === SLIDES.length - 1) return;
    setDirection(1);
    setCurrent((c) => c + 1);
  };

  const goTo = (i: number) => {
    setDirection(i > current ? 1 : -1);
    setCurrent(i);
  };

  // Sync hash → state (back/forward browser buttons)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      const idx = SLIDES.findIndex((s) => s.id === hash);
      if (idx >= 0 && idx !== current) {
        setDirection(idx > current ? 1 : -1);
        setCurrent(idx);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [current]);

  // Sync state → hash
  useEffect(() => {
    window.location.hash = SLIDES[current].id;
  }, [current]);

  // Keyboard navigation — use refs to avoid stale closure without re-registering
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setCurrent((c) => Math.min(SLIDES.length - 1, c + 1));
        setDirection(1);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setCurrent((c) => Math.max(0, c - 1));
        setDirection(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch swipe navigation — skip if touch started inside a scrollable element
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let suppress = false;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      // Suppress swipe if touch started inside a no-swipe zone
      suppress = !!(e.target as Element)?.closest("[data-no-swipe]");
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (suppress) return;
      const deltaX = startX - e.changedTouches[0].clientX;
      const deltaY = Math.abs(startY - e.changedTouches[0].clientY);
      // Only trigger if horizontal movement dominates (not a vertical scroll)
      if (Math.abs(deltaX) < 50 || deltaY > Math.abs(deltaX)) return;
      if (deltaX > 0) {
        setCurrent((c) => Math.min(SLIDES.length - 1, c + 1));
        setDirection(1);
      } else {
        setCurrent((c) => Math.max(0, c - 1));
        setDirection(-1);
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const SlideComponent = SLIDE_COMPONENTS[SLIDES[current].id];

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 24 : -24,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -24 : 24,
      opacity: 0,
    }),
  };

  return (
    <div className="relative min-h-screen bg-(--bg) text-(--text-main) overflow-x-hidden">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="w-full h-full"
          style={{
            backgroundSize: "40px 40px",
            backgroundImage:
              "linear-gradient(to right, rgba(107,114,128,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(107,114,128,0.04) 1px, transparent 1px)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* ── Top nav strip — hidden on mobile ── */}
        <div className="hidden md:block fixed top-0 left-0 right-0 z-50 px-3 pt-3">
          <div className="flex overflow-x-auto scrollbar-none backdrop-blur-md rounded-xl border border-border bg-(--card-bg)/90 px-2 py-1.5 gap-0.5">
            {SLIDES.map((s, i) => (
              <button
                type="button"
                key={s.id}
                onClick={() => goTo(i)}
                className={`font-mono text-[0.55rem] md:text-[0.6rem] uppercase tracking-widest px-2.5 md:px-3 py-1.5 whitespace-nowrap transition-colors rounded-lg shrink-0 ${
                  i === current
                    ? "bg-primary text-(--bg) font-bold"
                    : "text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)"
                }`}
              >
                {/* On mobile show only the number, on md+ show full label */}
                <span className="md:hidden">{s.label.split(" / ")[0]}</span>
                <span className="hidden md:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Slide content ── */}
        <div className="fixed inset-0 pt-4 pb-16 px-4 md:pt-14 md:pb-14 md:px-12">
          <div className="h-full max-w-6xl mx-auto w-full">
            {mounted ? (
              <AnimatePresence mode="wait" custom={direction}>
                <m.div
                  key={current}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full py-3 md:py-6 overflow-y-auto scrollbar-none"
                >
                  <SlideComponent />
                </m.div>
              </AnimatePresence>
            ) : (
              <div className="h-full" />
            )}
          </div>
        </div>

        {/* ── Bottom nav ── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 md:px-6 md:pb-4">
          <div className="flex items-center gap-2 md:gap-4 bg-(--card-bg)/90 backdrop-blur-md rounded-xl border border-border px-3 py-2 md:bg-transparent md:backdrop-blur-none md:rounded-none md:border-0 md:px-0 md:py-0">
            {/* Prev */}
            <button
              type="button"
              onClick={prev}
              disabled={current === 0}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1.5 rounded-lg hover:bg-(--hover-bg) md:hover:bg-transparent shrink-0"
            >
              <ChevronLeft size={13} />
              <span className="hidden sm:inline">Prev</span>
            </button>

            {/* Progress */}
            <div className="flex-1 min-w-0">
              <Progress
                value={current + 1}
                max={SLIDES.length}
                showPercentage={false}
                animate
                size="extraSmall"
              />
            </div>

            {/* Slide counter — visible on mobile */}
            <span className="font-mono text-[10px] text-(--text-muted) shrink-0 md:hidden">
              {current + 1}/{SLIDES.length}
            </span>

            {/* Next */}
            <button
              type="button"
              onClick={next}
              disabled={current === SLIDES.length - 1}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1.5 rounded-lg hover:bg-(--hover-bg) md:hover:bg-transparent shrink-0"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={13} />
            </button>

            <div className="w-px h-4 bg-border shrink-0" />

            <CompactThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
