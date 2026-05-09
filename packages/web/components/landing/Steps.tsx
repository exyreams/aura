import { Reveal } from "@/components/landing/Reveal";

export function Steps() {
  return (
    <section
      id="how-it-works"
      className="border-t border-border max-w-6xl mx-auto z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal>
        <div className="mb-12 md:mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Execution Flow
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold text-(--text-main)">
            How AURA Works
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            From encrypted policy setup to multi-chain execution — every step
            is cryptographically enforced on Solana.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
          <div className="bg-white/2 border border-border p-6 md:p-10 transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#d1d5db]/5 hover:border-primary hover:-translate-y-1.5">
            <div className="text-4xl md:text-5xl font-bold text-(--text-main)/5 font-mono mb-4 md:mb-6">
              01
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-(--text-main)">
              Encrypt Your Policy
            </h3>
            <p className="text-(--text-muted) text-xs md:text-sm leading-relaxed">
              Set daily limits, per-transaction caps, and spend counters. AURA
              encrypts these into FHE ciphertexts stored on-chain — no one can
              read the actual values, including validators.
            </p>
          </div>
          <div className="bg-white/2 border border-border p-6 md:p-10 transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#d1d5db]/5 hover:border-primary hover:-translate-y-1.5">
            <div className="text-4xl md:text-5xl font-bold text-(--text-main)/5 font-mono mb-4 md:mb-6">
              02
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-(--text-main)">
              Agent Proposes, FHE Decides
            </h3>
            <p className="text-(--text-muted) text-xs md:text-sm leading-relaxed">
              Your AI agent submits a transaction proposal. Ika's Encrypt
              network runs the policy graph over the encrypted values and
              returns an encrypted violation code — approved or denied, without
              revealing the limits.
            </p>
          </div>
          <div className="bg-white/2 border border-border p-6 md:p-10 transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#d1d5db]/5 hover:border-primary hover:-translate-y-1.5">
            <div className="text-4xl md:text-5xl font-bold text-(--text-main)/5 font-mono mb-4 md:mb-6">
              03
            </div>
            <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-(--text-main)">
              dWallet Co-Signs, Chain Settles
            </h3>
            <p className="text-(--text-muted) text-xs md:text-sm leading-relaxed">
              Approved proposals are co-signed by an Ika dWallet record. The
              agent never holds a raw private key — execution happens natively
              on Ethereum, Bitcoin, Solana, and more.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
