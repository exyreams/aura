"use client";

import { Accordion } from "@/components/global/Accordion";
import { Reveal } from "@/components/landing/Reveal";

export function FAQ() {
  const faqItems = [
    {
      id: "1",
      title: "What is AURA?",
      content:
        "AURA (Autonomous Universal Resource Agent) is an encrypted treasury system for AI agents on Solana. It lets agents manage real crypto treasuries without exposing spending strategy on-chain and without trusting a centralized approval server. Spending limits are stored as FHE ciphertexts, policy evaluation runs over encrypted values via Ika's Encrypt network, and execution is co-signed by Ika dWallet records.",
    },
    {
      id: "2",
      title: "How do encrypted spending limits work?",
      content:
        "When you configure a treasury, AURA encrypts your daily limit, per-transaction cap, and running spend counter into FHE ciphertexts stored on-chain. When an agent proposes a transaction, Ika's Encrypt network runs a compiled FHE circuit over those ciphertexts and returns an encrypted violation code — 0 means approved. The actual limit values are never revealed to anyone, including validators.",
    },
    {
      id: "3",
      title: "What chains does AURA support for execution?",
      content:
        "Solana is the settlement anchor where the treasury program lives. For multi-chain execution, AURA uses Ika dWallet co-signing to execute natively on Ethereum, Bitcoin, Polygon, Arbitrum, and Optimism. The agent never holds a raw private key for any chain — the dWallet record handles signing.",
    },
    {
      id: "4",
      title: "What does the policy engine actually check?",
      content:
        "17 rules evaluated in order: per-transaction limit, daily limit with reputation scaling, Bitcoin manual review threshold, time window (hourly) limit, protocol allowlist, slippage cap, quote freshness, counterparty risk score, shared swarm pool limit, velocity window, anomaly detection, cooldown, budget envelope daily/weekly caps, approval ladder, scoped pause, and external liveness checks. Confidential spend checks (encrypted daily/per-tx comparisons) are handled separately by the Ika Encrypt FHE circuit.",
    },
    {
      id: "5",
      title: "Can I override the agent in an emergency?",
      content:
        "Yes. AURA includes an emergency multisig with configurable guardian threshold. Any guardian can propose a daily limit override; once enough guardians co-sign within the expiry window, the change applies immediately. You can also pause execution, cancel pending proposals, or rotate the AI authority key without touching the encrypted guardrails.",
    },
    {
      id: "6",
      title: "How do agent swarms work?",
      content:
        "Multiple agents can share a single treasury's spending pool via the swarm configuration. Each member agent's finalized transactions increment a shared counter. The policy engine blocks any member whose transaction would push the collective total over the shared pool cap — enforced on-chain, not by a coordinator.",
    },
    {
      id: "7",
      title: "Is AURA ready for mainnet?",
      content:
        "AURA is currently on Solana devnet in pre-alpha. The program, SDK, CLI, backend, and dashboard are all functional and test-covered. It should not be used with real funds until a stable release and security audit are published. The pre-alpha label is accurate.",
    },
    {
      id: "8",
      title: "How do I get started?",
      content:
        "Connect a Solana wallet on the dashboard, create a treasury with your policy configuration, set up FHE guardrails via the Guardrails page, register a dWallet for multi-chain execution, and create an agent keypair under Signers. The CLI is available for programmatic control. Full documentation is at docs-auraprotocol.vercel.app.",
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
            Everything you need to know about AURA's encrypted treasury
            guardrails and autonomous agent operations.
          </p>
        </div>

        <Accordion items={faqItems} defaultOpen="1" />
      </Reveal>
    </section>
  );
}
