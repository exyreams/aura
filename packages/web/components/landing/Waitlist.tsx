import { Button } from "@/components/global/Button";
import { Reveal } from "@/components/landing/Reveal";

export function Waitlist() {
  return (
    <section className="border-t border-border mb-20 z-10 px-6 py-[80px] md:py-[100px] md:px-[4vw]">
      <Reveal className="max-w-3xl mx-auto">
        <div className="p-8 md:p-12 border border-border bg-white/2 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-(--primary)/5 blur-[100px] pointer-events-none"></div>
          <div className="relative z-10 text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-3 md:mb-4 text-(--text-main)">
              Ready to secure the agentic future?
            </h2>
            <p className="text-sm md:text-base text-(--text-muted) mb-6 md:mb-8">
              Join the waitlist for the AURA v1 Mainnet release.
            </p>
            <div className="flex flex-col md:flex-row gap-3 justify-center">
              <input
                type="email"
                placeholder="agent_id@protocol.com"
                className="bg-(--bg) border border-border px-4 md:px-5 py-2.5 md:py-3 font-mono text-xs md:text-sm focus:border-primary text-(--text-main) outline-none md:w-80 transition-colors"
              />
              <Button
                variant="primary"
                className="px-6 md:px-8! py-2.5 md:py-3! rounded-none! font-mono! text-xs! uppercase! whitespace-nowrap"
              >
                Initialize Access
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
