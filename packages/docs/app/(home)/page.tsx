import Link from "next/link";
import { StreamingText } from "@/components/StreamingText";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-main)] overflow-x-hidden">
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

      <section className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-center items-start px-6 py-[120px] md:px-[4vw] overflow-hidden">
        <StreamingText />

        {/* Watermark */}
        <div className="absolute -bottom-8 left-0 right-0 text-[8rem] md:text-[12rem] font-black leading-none text-[var(--text-main)] opacity-[0.02] pointer-events-none -z-10 uppercase text-center overflow-hidden whitespace-nowrap select-none">
          AUTONOMOUS
        </div>

        <div className="max-w-4xl relative z-10">
          <div className="inline-block px-3 py-1 bg-gray-500/10 border border-[var(--primary)] text-[var(--primary)] font-mono text-[0.7rem] uppercase tracking-widest mb-6">
            Documentation
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-8 text-[var(--text-main)]">
            Confidential
            <br />
            Policy Controls
            <br />
            <span className="bg-gradient-to-r from-gray-100 via-gray-300 to-gray-500 bg-clip-text text-transparent">
              for Agent Treasuries.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[var(--text-muted)] max-w-2xl leading-[1.6] font-light mb-10">
            Production docs for the AURA program surface, TypeScript SDK, Rust
            SDK, CLI, backend service, and web control plane.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="rounded-none bg-[var(--primary)] px-10 py-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--bg)] transition-opacity hover:opacity-90"
            >
              Open Docs
            </Link>
            <Link
              href="/docs/sdk-ts"
              className="rounded-none border border-[var(--border)] bg-transparent px-10 py-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-main)] transition-colors hover:bg-white/5 hover:border-[var(--primary)]"
            >
              TypeScript SDK

            </Link>
            <Link
              href="/docs/cli"
              className="rounded-none border border-[var(--border)] bg-transparent px-10 py-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-main)] transition-colors hover:bg-white/5 hover:border-[var(--primary)]"
            >
              CLI Reference
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
