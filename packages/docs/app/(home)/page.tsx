import Link from "next/link";
import { StreamingText } from "@/components/StreamingText";

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: "Confidential Guardrails",
    description: "Daily and per-tx limits stored as FHE ciphertexts. Policy evaluation runs over encrypted values — limits never touch plaintext on-chain.",
    href: "/docs/overview/confidential-guardrails",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "dWallet Co-signing",
    description: "Approved proposals are co-signed through Ika dWallet records. Agents never hold raw private keys — execution is gated by the AURA program.",
    href: "/docs/overview/dwallet-execution",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Policy Engine",
    description: "27 violation codes, 17 evaluation rules, time windows, velocity limits, anomaly detection, approval ladders, and scoped pauses — all in pure Rust.",
    href: "/docs/overview/policy-engine",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    title: "Multi-chain",
    description: "Bitcoin, Ethereum, Solana, Polygon, Arbitrum, and Optimism from a single Solana treasury. One policy config governs all chains.",
    href: "/docs/overview/architecture",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: "TypeScript SDK",
    description: "67 typed instruction builders, PDA helpers, event parsing, and the high-level Aura facade with auto timestamps and plain-number inputs.",
    href: "/docs/sdk-ts",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    title: "CLI & Dashboard",
    description: "Full terminal interface with --json output for CI, --dry-run for safe inspection, and a live Ink dashboard for real-time treasury monitoring.",
    href: "/docs/cli",
  },
];

const sdks = [
  { label: "TypeScript SDK", href: "/docs/sdk-ts", desc: "@aura-protocol/sdk-ts" },
  { label: "Rust SDK", href: "/docs/sdk-rs", desc: "aura-sdk" },
  { label: "CLI", href: "/docs/cli", desc: "@aura-protocol/cli" },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-(--bg) text-(--text-main) overflow-x-hidden">
      {/* Grid Background */}
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

      {/* Hero */}
      <section className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-6 py-[120px] md:px-[4vw] overflow-hidden text-center">
        <StreamingText />

        <div className="max-w-4xl relative z-10">
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-sm border border-(--border) bg-(--card-bg) text-(--text-muted) font-mono text-[10px] font-bold uppercase tracking-wider mb-8">
            Pre-alpha · Devnet only
          </div>
          <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-[1.05] mb-8 text-(--text-main)">
            The complete reference
            <br />
            for building with{" "}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 820.9 192.02"
              fill="currentColor"
              aria-label="AURA"
              role="img"
              className="inline-block align-middle"
              style={{ height: "0.85em", width: "auto", verticalAlign: "-0.05em" }}
            >
              <path d="M617.81,81.52c8.68-6.2,18.83-10.53,29.4-10.53h53.65s-54.18,41.18-54.18,41.18c-13.66,10.38-12.48,18.79-17.06,34.48l101,.03,7.77-31.45-84.52-.11,58.36-44.34,37.35-.02,5.75-23.44,57.16-43.8c1.67-1.28,4.6-.88,5.86.47,1.74,1.86,3.07,4.84,2.38,7.68l-27.06,111.62-16.49,68.67h-30.4s-18.7-35.97-18.7-35.97l-48.2,36.01-80.69-.02c-11.7-1.27-21.1-7.64-25.52-18.32-2.49-6.7-2.92-13.82-1.11-20.83l7.42-28.83c2.58-10.04,8.24-19.44,16.23-26.01,7.1-5.84,13.87-10.96,21.62-16.49Z"/>
              <path d="M47.45,80.63c10.57-6.94,21.82-9.99,34.15-9.92l47.85.25-54.94,41.71c-12.66,9.61-12.1,19.53-16.25,33.99h89.5s7.74-31.37,7.74-31.37l-72.9-.36,57.88-44.01,26.44-.22,5.78-23.37L230.83,3.02c1.78-.84,4.97.75,5.74,1.99s2.11,3.94,1.6,6.05l-39.12,161.01-4.78,19.93h-30.39s-18.61-36.02-18.61-36.02l-48.09,36.05-69.15-.32c-18.47-.09-30.86-17.11-27.46-34.93,2.14-11.22,5-21.68,8.09-32.83,2.88-10.39,8.46-20.26,16.97-26.72l21.83-16.59Z"/>
              <path d="M291.44,120.38c.25,5.37-6.36,20.25-3.61,24.18.62.89,2.67,2.11,4.04,2.11h64.98c6.49-.71,11.57-4.27,13.7-10.43l17.13-71.44,68.98-51.87-33.68,139.78c-5.27,20.43-22.88,38.79-44.89,38.83l-122.13.23c-13.77.03-24.71-9.79-28.73-22.68l64.2-48.71Z"/>
              <path d="M527.69,61.28c-2.39,1.94-3.7,4.51-4.41,7.78l-29.94,122.94-56.63.02,32.21-133.54c1.71-7.02,4.82-12.84,10.36-17.4l36.12-29.7c8.87-6.23,18.63-11.23,29.89-11.23h93.11s-53.36,46.78-53.36,46.78l-36.34-.04c-2.82.46-5.46,1.78-7.66,3.54l-13.36,10.85Z"/>
              <path d="M294.36,109.3l-67.32,51.01c-.33-4.09.33-7.81,1.32-12.15L264.18.06l56.43-.02-26.25,109.27Z"/>
              <path d="M158.74,46.89H29.27S62.38,6.54,62.38,6.54c3.59-3.37,7.07-6.16,12.23-6.51l144.1.09-59.96,46.78Z"/>
              <path d="M737.79,46.89l-126.39-.02,43.21-40.54c3.82-3.18,7.36-5.65,12.49-6.31l131.27.08-60.59,46.78Z"/>
              <path d="M458.23,2.98l-67.91,50.85L403.26.1l55.79-.1c-.06.91-.26,1.54-.81,2.98Z"/>
            </svg>
            <span className="text-(--text-muted)">.</span>
          </h1>
          <p className="text-base md:text-lg text-(--text-muted) max-w-xl mx-auto leading-[1.7] font-light mb-10">
            Program instructions, TypeScript SDK, Rust SDK, CLI, confidential
            guardrails, and dWallet execution — all in one place.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/docs/overview"
              className="inline-flex items-center gap-2 rounded-sm bg-(--primary) px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-(--bg) transition-opacity hover:opacity-80"
            >
              Get Started
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link
              href="/docs/overview/architecture"
              className="inline-flex items-center gap-2 rounded-sm bg-(--card-bg) border border-(--border) px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-(--primary) hover:bg-(--hover-bg)"
            >
              Architecture
            </Link>
            <Link
              href="https://github.com/aura-protocol/aura"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm bg-(--card-bg) border border-(--border) px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-(--text-muted) transition-colors hover:border-(--primary) hover:bg-(--hover-bg)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub
            </Link>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="relative z-10 px-6 md:px-[4vw] pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="font-mono text-[0.7rem] uppercase tracking-widest text-(--primary) mb-3">What it does</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-(--text-main)">Built for autonomous agents</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-(--border)">
            {features.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="group bg-(--bg) p-8 hover:bg-(--card-bg) transition-colors"
              >
                <div className="text-(--primary) mb-4 opacity-70 group-hover:opacity-100 transition-opacity">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-(--text-main) mb-2 text-sm tracking-wide">{f.title}</h3>
                <p className="text-(--text-muted) text-sm leading-relaxed">{f.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* SDK quick links */}
      <section className="relative z-10 px-6 md:px-[4vw] pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10">
            <p className="font-mono text-[0.7rem] uppercase tracking-widest text-(--primary) mb-3">SDKs & Tools</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-(--text-main)">Pick your interface</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-(--border)">
            {sdks.map((sdk) => (
              <Link
                key={sdk.label}
                href={sdk.href}
                className="group bg-(--bg) p-8 hover:bg-(--card-bg) transition-colors flex flex-col justify-between min-h-[140px]"
              >
                <div>
                  <h3 className="font-semibold text-(--text-main) mb-1">{sdk.label}</h3>
                  <p className="font-mono text-xs text-(--text-muted)">{sdk.desc}</p>
                </div>
                <div className="mt-6 font-mono text-xs text-(--primary) uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">
                  View docs
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
        
        {/* Watermark */}
        <div className="absolute -bottom-8 left-0 right-0 text-[10rem] md:text-[16rem] font-black leading-none text-(--text-main) pointer-events-none uppercase text-center opacity-3 overflow-hidden whitespace-nowrap select-none">
          AUTONOMOUS
        </div>

      </section>

      {/* Program IDs */}
      <section className="relative z-10 px-6 md:px-[4vw] pb-32">
        <div className="max-w-6xl mx-auto border border-(--border) p-8 md:p-12">
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-(--primary) mb-6">Devnet deployment</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { label: "aura-core", value: "EaRoLVwL8EErDUeEMPHJ5QJeLVQZWJMtZcgmFzT9bhHs" },
              { label: "Ika Encrypt", value: "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8" },
              { label: "Ika dWallet", value: "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY" },
            ].map((item) => (
              <div key={item.label}>
                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-(--text-muted) mb-2">{item.label}</p>
                <p className="font-mono text-xs text-(--text-main) break-all">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
