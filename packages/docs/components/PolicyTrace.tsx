"use client";

import { useEffect, useState } from "react";

type RuleResult = {
  rule: string;
  detail: string;
  pass: boolean;
};

type Trace = {
  agentId: string;
  amount: number;
  chain: string;
  rules: RuleResult[];
  verdict: "approved" | "denied" | "pending";
};

const TRACES: Trace[] = [
  {
    agentId: "agent-prod-1",
    amount: 250,
    chain: "ethereum",
    rules: [
      { rule: "scoped_pause", detail: "scope is not paused", pass: true },
      { rule: "per_tx_limit", detail: "250 ≤ 1,000", pass: true },
      { rule: "daily_limit", detail: "3,250 + 250 ≤ 10,000", pass: true },
      { rule: "time_window_limit", detail: "projected 750 ≤ 2,500", pass: true },
      { rule: "protocol_whitelist", detail: "protocol 2 allowed", pass: true },
      { rule: "counterparty_risk", detail: "score 15 ≤ 70", pass: true },
      { rule: "velocity_limit", detail: "1,250 + 250 ≤ 5,000", pass: true },
    ],
    verdict: "approved",
  },
  {
    agentId: "agent-prod-2",
    amount: 1500,
    chain: "bitcoin",
    rules: [
      { rule: "scoped_pause", detail: "scope is not paused", pass: true },
      { rule: "per_tx_limit", detail: "1,500 > 1,000", pass: false },
    ],
    verdict: "denied",
  },
  {
    agentId: "agent-prod-1",
    amount: 800,
    chain: "polygon",
    rules: [
      { rule: "scoped_pause", detail: "scope is not paused", pass: true },
      { rule: "per_tx_limit", detail: "800 ≤ 1,000", pass: true },
      { rule: "daily_limit", detail: "3,500 + 800 ≤ 10,000", pass: true },
      { rule: "time_window_limit", detail: "projected 1,550 ≤ 2,500", pass: true },
      { rule: "velocity_limit", detail: "2,050 + 800 > 5,000", pass: false },
    ],
    verdict: "denied",
  },
  {
    agentId: "agent-prod-3",
    amount: 100,
    chain: "solana",
    rules: [
      { rule: "scoped_pause", detail: "scope is not paused", pass: true },
      { rule: "per_tx_limit", detail: "100 ≤ 1,000", pass: true },
      { rule: "daily_limit", detail: "900 + 100 ≤ 10,000", pass: true },
      { rule: "time_window_limit", detail: "projected 350 ≤ 2,500", pass: true },
      { rule: "protocol_whitelist", detail: "protocol 0 allowed", pass: true },
      { rule: "counterparty_risk", detail: "score 8 ≤ 70", pass: true },
      { rule: "velocity_limit", detail: "850 + 100 ≤ 5,000", pass: true },
    ],
    verdict: "approved",
  },
];

const RULE_DELAY = 320; // ms per rule
const PAUSE_AFTER = 2200; // ms before next trace

export function PolicyTrace() {
  const [traceIdx, setTraceIdx] = useState(0);
  const [visibleRules, setVisibleRules] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);

  useEffect(() => {
    const trace = TRACES[traceIdx];
    setVisibleRules(0);
    setShowVerdict(false);

    let rule = 0;
    const revealNext = () => {
      rule += 1;
      setVisibleRules(rule);
      if (rule < trace.rules.length) {
        // stop early on first failure
        const current = trace.rules[rule - 1];
        if (!current.pass) {
          setTimeout(() => setShowVerdict(true), RULE_DELAY);
          setTimeout(() => {
            setTraceIdx((i) => (i + 1) % TRACES.length);
          }, RULE_DELAY + PAUSE_AFTER);
          return;
        }
        setTimeout(revealNext, RULE_DELAY);
      } else {
        setTimeout(() => setShowVerdict(true), RULE_DELAY);
        setTimeout(() => {
          setTraceIdx((i) => (i + 1) % TRACES.length);
        }, RULE_DELAY + PAUSE_AFTER);
      }
    };

    const t = setTimeout(revealNext, 400);
    return () => clearTimeout(t);
  }, [traceIdx]);

  const trace = TRACES[traceIdx];

  return (
    <div className="absolute right-[2vw] top-1/2 -translate-y-1/2 w-[420px] pointer-events-none hidden lg:block">
      <div className="relative font-mono text-[11px] leading-relaxed">
        {/* fade top/bottom */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-linear-to-b from-(--bg) to-transparent z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-(--bg) to-transparent z-10" />

        <div className="opacity-80 space-y-0.5 py-8">
          {/* header */}
          <div className="text-(--text-muted) mb-3">
            <span className="text-(--primary)">evaluate_transaction</span>
            {"("}
            <span className="text-(--text-main)">{trace.agentId}</span>
            {", "}
            <span className="text-(--text-main)">${trace.amount}</span>
            {", "}
            <span className="text-(--text-main)">{trace.chain}</span>
            {")"}
          </div>

          {/* rules */}
          {trace.rules.slice(0, visibleRules).map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={r.pass ? "text-green-500" : "text-red-400"}>
                {r.pass ? "✓" : "✗"}
              </span>
              <span className="text-(--text-muted)">
                <span className={r.pass ? "text-(--text-main)" : "text-red-400"}>
                  {r.rule}
                </span>
                <span className="text-(--text-muted) opacity-60"> — {r.detail}</span>
              </span>
            </div>
          ))}

          {/* verdict */}
          {showVerdict && (
            <div className={`mt-3 pt-3 border-t border-(--border) font-bold tracking-wider ${
              trace.verdict === "approved" ? "text-green-500" : "text-red-400"
            }`}>
              {trace.verdict === "approved"
                ? "→ PolicyDecision { approved: true }"
                : `→ PolicyDecision { violation: ${
                    trace.rules.find((r) => !r.pass)?.rule ?? "unknown"
                  } }`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
