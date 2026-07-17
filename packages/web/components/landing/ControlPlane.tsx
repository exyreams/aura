import {
  Activity,
  Bot,
  CheckCircle,
  Database,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

const layers = [
  {
    icon: Wallet,
    title: "Wallet inventory",
    detail:
      "Agent-created dWallets, owner wallets, fee wallets, and external recipients are tracked as metadata while balances are read from chain.",
  },
  {
    icon: Bot,
    title: "Agent sessions",
    detail:
      "Conduit sessions, scopes, device approvals, and request context land in the same control plane the owner can inspect.",
  },
  {
    icon: ShieldCheck,
    title: "Policy decisions",
    detail:
      "AURA policy checks budgets, limits, recipients, protocols, liveness, pauses, and approvals before settlement is allowed.",
  },
  {
    icon: Activity,
    title: "Activity trail",
    detail:
      "Requests, approvals, denials, settlements, and recovery actions become reviewable events instead of hidden agent side effects.",
  },
];

const requestRows = [
  ["Agent", "payroll-agent"],
  ["Request", "USDC payout batch"],
  ["Policy", "Budget ok · recipient list ok"],
  ["Owner action", "Approval required"],
  ["Settlement", "dWallet signature pending"],
];

export function ControlPlane() {
  return (
    <section
      id="control-plane"
      className="border-t border-border bg-(--text-main)/1 relative z-10 px-6 py-[120px] md:px-[4vw]"
    >
      <Reveal className="max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-(--text-muted) mb-4 block">
            Control Plane
          </span>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-(--text-main)">
            A live operating view for agent wallets
          </h2>
          <p className="text-(--text-muted) mt-4 max-w-3xl mx-auto text-sm md:text-base leading-relaxed">
            AURA Web is where an owner sees what an agent is trying to do:
            funded wallets, sessions, policy flags, pending approvals, and
            settlement state. Supabase holds the control-plane metadata; Solana
            and AURA remain the source of truth for funds and execution.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 md:gap-8 items-stretch">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {layers.map((layer) => {
              const Icon = layer.icon;
              return (
                <article
                  key={layer.title}
                  className="border border-border bg-(--bg) p-6 transition-colors hover:border-primary hover:bg-white/5"
                >
                  <div className="size-10 rounded-md border border-border bg-(--card-bg) flex items-center justify-center mb-5">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-(--text-main) mb-2">
                    {layer.title}
                  </h3>
                  <p className="text-sm text-(--text-muted) leading-relaxed">
                    {layer.detail}
                  </p>
                </article>
              );
            })}
          </div>

          <aside className="border border-border bg-(--bg) p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4 mb-8">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                    Example Request
                  </span>
                  <h3 className="text-xl font-semibold text-(--text-main) mt-2">
                    Agent spend review
                  </h3>
                </div>
                <div className="size-10 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center">
                  <CheckCircle
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {requestRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 border border-border bg-(--card-content) px-3 py-3"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                      {label}
                    </span>
                    <span className="text-sm text-(--text-main) text-right">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-border pt-5 flex items-start gap-3">
              <Database className="size-5 text-primary mt-0.5" aria-hidden />
              <p className="text-xs md:text-sm text-(--text-muted) leading-relaxed">
                Metadata can be indexed for speed, but balances, policy
                accounts, proposals, signatures, and settlements are verified
                against chain state before money moves.
              </p>
            </div>
          </aside>
        </div>
      </Reveal>
    </section>
  );
}
