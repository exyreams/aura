import { Ban, ShieldCheck } from "lucide-react";
import { Card } from "@/components/global/Card";

export const GovernanceAudit = () => {
  return (
    <Card hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Governance and Audit
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Live governance state plus recent audit events.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-3 bg-(--card-content) border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-2">
            Multisig
          </span>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-(--success-text)" />
            <span className="text-xs text-(--text-main)">2-of-3 active</span>
          </div>
        </div>
        <div className="p-3 bg-(--card-content) border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-2">
            Swarm
          </span>
          <div className="flex items-center gap-2">
            <Ban size={14} className="text-(--text-muted)" />
            <span className="text-xs text-(--text-muted)">Not configured</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-2">
          Recent Events
        </span>
        <div className="space-y-3">
          {[
            {
              type: "POLICY_AUDIT",
              time: "2h ago",
              desc: "Max slippage updated to 50 bps",
            },
            {
              type: "SPEND_PROPOSAL",
              time: "5h ago",
              desc: "Swap approved: 10.5 SOL → USDC",
            },
            {
              type: "LIMIT_UPDATE",
              time: "1d ago",
              desc: "Daily limit increased to $5k",
            },
            {
              type: "DWALLET_REGISTER",
              time: "2d ago",
              desc: "Ethereum dWallet added",
            },
            {
              type: "AGENT_INIT",
              time: "14d ago",
              desc: "Treasury initialized",
            },
          ].map((event) => (
            <div
              key={`${event.type}-${event.time}`}
              className="flex gap-4 items-start"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-(--text-muted) mt-1.5 shrink-0"></div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="font-mono text-[11px] text-(--text-main)">
                    {event.type}
                  </span>
                  <span className="font-mono text-[10px] text-(--text-muted)">
                    {event.time}
                  </span>
                </div>
                <p className="text-[11px] text-(--text-muted)">{event.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
