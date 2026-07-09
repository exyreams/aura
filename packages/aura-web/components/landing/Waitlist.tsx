import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/global/Button";
import { Reveal } from "@/components/landing/Reveal";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

export function Waitlist() {
  return (
    <section className="border-t border-border mb-20 z-10 px-6 py-[80px] md:py-[100px] md:px-[4vw]">
      <Reveal className="max-w-3xl mx-auto">
        <div className="p-8 md:p-12 border border-border bg-white/2 relative overflow-hidden">
          <div className="relative z-10 text-center">
            <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
              Devnet Control Center
            </span>
            <h2 className="text-2xl md:text-4xl font-semibold mb-3 md:mb-4 text-(--text-main)">
              Start with the wallet view
            </h2>
            <p className="text-sm md:text-base text-(--text-muted) mb-6 md:mb-8 max-w-2xl mx-auto leading-relaxed">
              Connect an owner wallet, inspect registered agent wallets, and
              verify balances from RPC. Fund movement stays gated until the real
              proposal and dWallet signing flow is wired into the UI.
            </p>
            <div className="flex flex-col md:flex-row gap-3 justify-center">
              <Link href="/dashboard">
                <Button
                  variant="primary"
                  icon={<ArrowRight className="size-4" />}
                  iconPosition="right"
                >
                  Open Dashboard
                </Button>
              </Link>
              <a href={DEFAULT_DOCS_URL} target="_blank" rel="noreferrer">
                <Button
                  variant="secondary"
                  icon={<BookOpen className="size-4" />}
                  iconPosition="left"
                >
                  Read Docs
                </Button>
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
