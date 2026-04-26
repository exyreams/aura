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
      approach: "Direct Key Access",
      compromise:
        "One logic bug or prompt injection leads to total treasury drainage. No safety net.",
      status: "CRITICAL RISK",
    },
    {
      approach: "Public On-Chain Limits",
      compromise:
        "MEV bots read your spending patterns and front-run every trade before it executes.",
      status: "EXPOSED",
    },
    {
      approach: "Centralized Approval",
      compromise:
        "A single server decides if the agent can spend. Not decentralized, not autonomous.",
      status: "FRAGILE",
    },
    {
      approach: "AURA FHE Protocol",
      compromise:
        "Limits are encrypted ciphertexts. Math happens over secrets. Impossible to read or front-run.",
      status: "AUTONOMOUS",
      isAura: true,
    },
  ];

  const columns: TableColumn<ProblemRow>[] = [
    {
      key: "approach",
      header: "Approach",
      render: (item: ProblemRow) => (
        <span className="font-bold text-base text-(--text-main)">
          {item.approach}
        </span>
      ),
    },
    {
      key: "compromise",
      header: "The Compromise",
      render: (item: ProblemRow) => (
        <span className="text-sm text-(--text-main)">{item.compromise}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: ProblemRow) => (
        <span className="font-mono text-xs text-(--text-muted)">
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
            The Dilemma
          </span>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-(--text-main)">
            The Agentic Trust Gap
          </h2>
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
