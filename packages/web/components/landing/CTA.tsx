"use client";

import { Button } from "@/components/global/Button";

export const LandingCTA = () => {
  return (
    <section className="mb-20 px-[4vw]">
      <div className="max-w-4xl mx-auto text-center opacity-0 translate-y-[30px] animate-[fadeInUp_1s_ease-out_forwards]">
        <div className="p-12 border border-[#334155] bg-[#0F172A]/10 rounded-sm relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-(--primary)/10 blur-[100px] pointer-events-none" />

          <h2 className="text-4xl md:text-6xl font-bold mb-8 text-white relative z-10">
            Ready to secure the agentic future?
          </h2>
          <p className="text-xl text-(--text-muted) mb-10 relative z-10">
            Join the waitlist for the AURA v1 Mainnet release.
          </p>

          <div className="flex flex-col md:flex-row gap-4 justify-center relative z-10">
            <input
              type="email"
              placeholder="agent_id@protocol.com"
              className="bg-black border border-white/20 px-6 py-4 mono text-sm focus:border-primary text-white outline-none md:w-80 rounded"
            />
            <Button variant="primary" size="large" className="px-10">
              Initialize Access
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
