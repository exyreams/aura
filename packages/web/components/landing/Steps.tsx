import { Reveal } from "@/components/landing/Reveal";

const steps = [
  {
    number: "01",
    title: "Register wallets",
    detail:
      "Owner wallets, agent-controlled dWallet records, and treasury metadata are indexed so every custody endpoint is visible before an agent acts.",
  },
  {
    number: "02",
    title: "Scope the agent",
    detail:
      "Conduit sessions define which tools, treasuries, wallets, and spending surfaces an AI agent can request through the control plane.",
  },
  {
    number: "03",
    title: "Gate the request",
    detail:
      "AURA policy checks budgets, recipients, chain profiles, pauses, quotas, approvals, and optional confidential limits before settlement.",
  },
  {
    number: "04",
    title: "Settle and review",
    detail:
      "Approved actions move through the dWallet path and leave activity, proposal, balance, and recovery context for the owner to inspect.",
  },
];

export function Steps() {
  return (
    <section
      id="how-it-works"
      className="border-t border-border max-w-7xl mx-auto z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal>
        <div className="mb-12 md:mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Execution Flow
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold text-(--text-main)">
            From agent intent to recoverable settlement
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            AURA is built around controlled money movement: register custody,
            scope the agent, enforce policy, then settle through the dWallet
            path with an audit trail.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {steps.map((step) => (
            <article
              key={step.number}
              className="bg-white/2 border border-border p-6 md:p-8 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/5 hover:border-primary hover:-translate-y-1.5"
            >
              <div className="text-4xl md:text-5xl font-bold text-(--text-main)/5 font-mono mb-4 md:mb-6">
                {step.number}
              </div>
              <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-(--text-main)">
                {step.title}
              </h3>
              <p className="text-(--text-muted) text-xs md:text-sm leading-relaxed">
                {step.detail}
              </p>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
