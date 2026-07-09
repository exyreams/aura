"use client";

import { Accordion } from "@/components/global/Accordion";
import { Reveal } from "@/components/landing/Reveal";

export function FAQ() {
  const faqItems = [
    {
      id: "1",
      title: "What is AURA?",
      content:
        "AURA is a control plane for AI agents that need to request, govern, and settle crypto actions. The web app gives owners visibility into wallets, sessions, approvals, and activity. The Solana program owns policy and proposal state. Conduit is the agent-facing runtime path, and dWallet records handle approved settlement without giving the agent raw private keys.",
    },
    {
      id: "2",
      title: "Is AURA only encrypted guardrails?",
      content:
        "No. Confidential guardrails are one capability for private thresholds and counters. AURA also includes wallet registry metadata, live balance reads, agent sessions, device approvals, sign requests, address lists, budget controls, exposure groups, scoped pauses, governance paths, recovery flows, and dWallet settlement lifecycle checks.",
    },
    {
      id: "3",
      title: "What does the web control center show today?",
      content:
        "The current aura-web slice supports Solana wallet auth, owner profiles, dashboard navigation, registered wallet metadata from Supabase, and live SOL/SPL/Token-2022 balance reads from RPC. Fund movement remains disabled until the real AURA proposal and dWallet signing path is wired into the UI.",
    },
    {
      id: "4",
      title: "Where does Supabase fit?",
      content:
        "Supabase stores control-plane metadata: owner profiles, wallet registry rows, agent sessions, device-code records, sign requests, idempotency records, and activity events. It does not become the source of truth for funds. Balances, proposals, policy accounts, and settlement state are still verified against chain state.",
    },
    {
      id: "5",
      title: "What does the policy engine check?",
      content:
        "AURA checks proposal-time controls such as spending caps, budgets, address lists, recipient exposure, chain profile validation, velocity windows, session quotas, scoped pauses, governance boundaries, liveness, and approval requirements. Confidential spend checks can use FHE-backed state when private limits are needed.",
    },
    {
      id: "6",
      title: "How does dWallet settlement help?",
      content:
        "The agent requests an action, AURA policy decides whether it can move forward, and approved settlements can be signed through a dWallet record. That keeps execution programmable without turning the agent runtime into the raw custody holder.",
    },
    {
      id: "7",
      title: "Is AURA ready for mainnet funds?",
      content:
        "No. AURA is pre-alpha and devnet-focused. The program, SDKs, CLI surfaces, docs, and smoke tests have been hardened significantly, but production funds should wait for a stable release, completed audits, and a mainnet deployment process.",
    },
    {
      id: "8",
      title: "How do I try it?",
      content:
        "Open the dashboard, connect a Solana wallet, and inspect the control-center surfaces. Wallet rows appear when metadata is written into the Supabase wallet registry, and Solana balances are read live from RPC. The docs explain the program and SDK surfaces for developers wiring AURA into agents.",
    },
  ];

  return (
    <section
      id="faq"
      className="border-t border-border max-w-4xl mx-auto z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal>
        <div className="mb-10 md:mb-12 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Common Questions
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold text-(--text-main)">
            Frequently Asked Questions
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            AURA combines a human control center, an agent runtime path, Solana
            policy enforcement, and dWallet settlement.
          </p>
        </div>

        <Accordion items={faqItems} defaultOpen="1" />
      </Reveal>
    </section>
  );
}
