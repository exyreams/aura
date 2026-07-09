"use client";

import {
  ArrowRight,
  BookOpen,
  ShieldCheck,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";

const signals = [
  { icon: Wallet, label: "Live wallet controls" },
  { icon: ShieldCheck, label: "Policy-gated execution" },
  { icon: Workflow, label: "dWallet settlement path" },
];

export function Hero() {
  const [streamContent, setStreamContent] = useState("");

  useEffect(() => {
    const generateStream = () => {
      let content = "";
      for (let i = 0; i < 50; i++) {
        let line = "";
        for (let j = 0; j < 120; j++) {
          line += chars[Math.floor(Math.random() * chars.length)];
        }
        content += `${line}\n`;
      }
      setStreamContent(content);
    };

    generateStream();
    const interval = setInterval(generateStream, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center items-start z-10 px-6 py-[120px] md:px-[4vw] overflow-hidden">
      {/* Streaming text background */}
      <div className="absolute right-[2vw] mt-8 top-1/2 -translate-y-1/2 w-[800px] pointer-events-none">
        <div className="relative overflow-hidden font-mono text-[10px] text-primary opacity-30 whitespace-pre text-right h-[600px]">
          <div className="absolute top-0 left-0 right-0 h-20 bg-linear-to-b from-(--bg) to-transparent z-10 pointer-events-none" />
          <div className="mask-[linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
            {streamContent}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-(--bg) to-transparent z-10 pointer-events-none" />
        </div>
      </div>

      <div className="absolute -bottom-8 left-0 right-0 text-[8rem] md:text-[12rem] font-black leading-none text-(--text-main)/2 pointer-events-none -z-10 uppercase text-center overflow-hidden whitespace-nowrap">
        AUTONOMOUS
      </div>

      <div className="max-w-4xl relative z-10">
        <div className="mb-6">
          <Badge variant="active">Pre-Alpha · Devnet Control Plane</Badge>
        </div>

        <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-[0.9] mb-8 text-(--text-main)">
          AURA
          <br />
          Control
          <br />
          <span className="bg-linear-to-r from-(--text-main) via-(--text-muted) to-primary bg-clip-text text-transparent">
            Plane
          </span>
        </h1>

        <p className="text-lg md:text-xl text-(--text-muted) max-w-2xl leading-[1.6] font-light mb-10">
          Give AI agents operational wallets without handing them raw keys. AURA
          combines owner-visible wallet controls, on-chain policy checks,
          Conduit agent sessions, and dWallet-signed settlement so every spend
          is visible, gated, and recoverable.
        </p>

        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard">
            <Button
              variant="primary"
              icon={<ArrowRight className="size-4" />}
              iconPosition="right"
            >
              Open Control Center
            </Button>
          </Link>
          <a href={DEFAULT_DOCS_URL} target="_blank" rel="noreferrer">
            <Button
              variant="secondary"
              icon={<BookOpen className="size-4" />}
              iconPosition="left"
            >
              Documentation
            </Button>
          </a>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div
                key={signal.label}
                className="inline-flex min-h-10 items-center gap-2 border border-border bg-(--card-bg) px-3 py-2"
              >
                <Icon className="size-4 text-primary" aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  {signal.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
