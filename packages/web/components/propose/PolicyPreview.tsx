"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Badge, Card } from "@/components/global";

interface PolicyPreviewProps {
  preview: {
    dailyLimitPass: boolean;
    perTxLimitPass: boolean;
    quoteAgePass: boolean;
    riskPass: boolean;
  };
}

export function PolicyPreview({ preview }: PolicyPreviewProps) {
  const checks = [
    { label: "Daily limit not exceeded", pass: preview.dailyLimitPass },
    {
      label: "Per-transaction limit within bounds",
      pass: preview.perTxLimitPass,
    },
    { label: "Quote age acceptable", pass: preview.quoteAgePass },
    { label: "Counterparty risk score acceptable", pass: preview.riskPass },
  ];

  const allPass = checks.every((check) => check.pass);

  return (
    <Card
      className="mb-8 animate-in slide-in-from-bottom-2 duration-300"
      hover={false}
    >
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Policy Evaluation Preview
        </h2>
        <p className="text-sm text-(--text-muted)">
          Real-time policy check against treasury configuration
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {checks.map((check) => (
            <div
              key={check.label}
              className={`flex items-center gap-3 py-3 px-4 border rounded-sm ${
                check.pass
                  ? "bg-success/5 border-success/10"
                  : "bg-danger/5 border-danger/10"
              }`}
            >
              {check.pass ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-danger" />
              )}
              <span className="text-xs text-(--text-main) opacity-80">
                {check.label}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-white/5 mt-4">
          <div className="flex items-center gap-3">
            <Badge variant={allPass ? "active" : "error"} className="text-xs">
              {allPass ? "All checks passed" : "Some checks failed"}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
