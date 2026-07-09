import { Table, type TableColumn } from "@/components/global/Table";
import { Reveal } from "@/components/landing/Reveal";

interface ProblemRow extends Record<string, unknown> {
  approach: string;
  compromise: string;
  status: string;
  isAura?: boolean;
}

export function Problem() {
  const data: ProblemRow[] = [
    {
      approach: "Raw agent key access",
      compromise:
        "The agent can sign anything the wallet can sign. A prompt injection, bad tool call, or compromised runtime becomes a direct funds-loss path.",
      status: "CRITICAL RISK",
    },
    {
      approach: "Dashboard-only monitoring",
      compromise:
        "You see balances after the fact, but the agent still acts before policy, approvals, or recovery workflows can intervene.",
      status: "TOO LATE",
    },
    {
      approach: "Centralized approval server",
      compromise:
        "A private backend can block requests, but it also becomes the bottleneck, custody choke point, and operational single point of failure.",
      status: "FRAGILE",
    },
    {
      approach: "AURA — policy + dWallet control plane",
      compromise:
        "Agents request actions through Conduit, owners see wallet state in AURA Web, policy gates execution on-chain, and approved settlements use dWallet signing.",
      status: "CONTROLLED",
      isAura: true,
    },
  ];

  const columns: TableColumn<ProblemRow>[] = [
    {
      key: "approach",
      header: "Approach",
      render: (item: ProblemRow) => (
        <span
          className={`font-bold text-base ${item.isAura ? "text-primary" : "text-(--text-main)"}`}
        >
          {item.approach}
        </span>
      ),
    },
    {
      key: "compromise",
      header: "The Reality",
      render: (item: ProblemRow) => (
        <span className="text-sm text-(--text-muted)">{item.compromise}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: ProblemRow) => (
        <span
          className={`font-mono text-xs ${item.isAura ? "text-primary font-bold" : "text-(--text-muted)"}`}
        >
          {item.status}
        </span>
      ),
    },
  ];

  return (
    <section
      id="problem"
      className="border-t border-border relative z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal className="max-w-6xl mx-auto">
        <div className="mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            The Problem
          </span>
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-(--text-main)">
            Agent wallets need more than a balance view
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            If an AI system can move funds, operators need request visibility,
            policy enforcement, custody separation, and recovery controls before
            the transaction settles.
          </p>
        </div>

        <Table
          columns={columns}
          data={data}
          keyExtractor={(item) => item.approach}
        />
      </Reveal>
    </section>
  );
}
