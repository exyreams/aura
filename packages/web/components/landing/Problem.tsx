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
      approach: "Raw Key Access",
      compromise:
        "One prompt injection or model bug drains the treasury. The agent holds the keys — there is no safety net.",
      status: "CRITICAL RISK",
    },
    {
      approach: "Public Spending Limits",
      compromise:
        "Limits visible on-chain let MEV bots read your strategy, front-run trades, and route around known thresholds.",
      status: "EXPOSED",
    },
    {
      approach: "Centralized Approval Server",
      compromise:
        "A single off-chain server decides every spend. It becomes the bottleneck, the honeypot, and the single point of failure.",
      status: "FRAGILE",
    },
    {
      approach: "AURA — FHE + dWallet",
      compromise:
        "Limits are encrypted ciphertexts. Policy runs over secrets via Ika Encrypt. Execution is co-signed by dWallet — no raw key, no readable limits, no central gatekeeper.",
      status: "AUTONOMOUS",
      isAura: true,
    },
  ];

  const columns: TableColumn<ProblemRow>[] = [
    {
      key: "approach",
      header: "Approach",
      render: (item: ProblemRow) => (
        <span className={`font-bold text-base ${item.isAura ? "text-primary" : "text-(--text-main)"}`}>
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
        <span className={`font-mono text-xs ${item.isAura ? "text-primary font-bold" : "text-(--text-muted)"}`}>
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
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-(--text-main)">
            The Agentic Trust Gap
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-2xl mx-auto text-sm md:text-base">
            Every existing approach forces a tradeoff between autonomy, security,
            and privacy. AURA eliminates all three.
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
