"use client";

import { Accordion } from "@/components/global/Accordion";
import { Reveal } from "@/components/landing/Reveal";

export function FAQ() {
  const faqItems = [
    {
      id: "1",
      title: "What is AURA and how does it work?",
      content:
        "AURA (Autonomous Universal Resource Agent) is a treasury management system for AI agents on Solana. It provides encrypted guardrails using FHE (Fully Homomorphic Encryption) to enforce spending limits while maintaining privacy. Agents can propose transactions, but every action is validated against an 11-rule policy engine before execution.",
    },
    {
      id: "2",
      title: "How are spending limits kept private on-chain?",
      content:
        "AURA uses Ika's Encrypt network to store policy limits as FHE ciphertexts. This means daily limits, per-transaction caps, and spending counters remain encrypted on-chain. Policy evaluation happens over encrypted data, preventing MEV exploitation while maintaining autonomous operation without centralized approval servers.",
    },
    {
      id: "3",
      title: "Which blockchains does AURA support?",
      content:
        "AURA supports multi-chain execution through Ika dWallet co-signing. Native support includes Ethereum, Bitcoin, Solana, Polygon, Arbitrum, and Optimism. Solana serves as the settlement anchor while dWallet-backed execution lanes extend treasury operations to other chains your agents monitor.",
    },
    {
      id: "4",
      title: "What are the 11 policy rules?",
      content:
        "The policy engine evaluates: daily spending limits, per-transaction limits, velocity windows, time-based restrictions, protocol whitelists, slippage protection, reputation scaling, chain-specific rules, emergency pause states, multisig requirements, and confidential threshold checks. All rules run in sequence before transaction approval.",
    },
    {
      id: "5",
      title: "Can I override agent decisions in emergencies?",
      content:
        "Yes. AURA includes an emergency governance system with guardian multisig override for break-glass scenarios. This requires threshold signatures from designated emergency responders to pause or modify treasury operations, providing a safety net without compromising normal autonomous operation.",
    },
    {
      id: "6",
      title: "How do agent swarms share spending pools?",
      content:
        "Multiple agents can be authorized to operate from the same treasury account. The policy engine tracks aggregate spending across all agents, enforcing shared daily limits and coordinating proposals. This enables collaborative agent strategies while maintaining unified spending controls.",
    },
    {
      id: "7",
      title: "Is AURA ready for production use?",
      content:
        "AURA is currently deployed on Solana devnet with 75 passing tests across the program layer. The SDK, CLI, and dashboard are under active development. The system is suitable for testing and development but should not be used with mainnet funds until a full security audit is completed.",
    },
    {
      id: "8",
      title: "How do I get started with AURA?",
      content:
        "Connect a Solana wallet, create a treasury with your desired policy configuration, register a dWallet for multi-chain execution, and authorize your AI agents. The dashboard provides a visual interface for treasury management, or you can use the CLI for programmatic control. Full documentation is available in the GitHub repository.",
    },
  ];

  return (
    <section className="border-t border-border max-w-4xl mx-auto z-10 px-6 py-[120px] md:px-[4vw]">
      <Reveal>
        <div className="mb-10 md:mb-12 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Common Questions
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-(--text-main)">
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
