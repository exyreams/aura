"use client";

import type { Dispatch, SetStateAction } from "react";
import { Dropdown, Input } from "@/components/global";
import { CHAINS, TX_TYPES } from "@/lib/aura-app";

interface FormState {
  amountUsd: string;
  chain: string;
  txType: string;
  recipient: string;
  protocolId: string;
  expectedOutputUsd: string;
  actualOutputUsd: string;
  quoteAgeSecs: string;
  counterpartyRiskScore: string;
}

interface TransactionDetailsFormProps {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
}

export function TransactionDetailsForm({
  form,
  setForm,
}: TransactionDetailsFormProps) {
  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Transaction Details
        </h2>
        <p className="text-sm text-(--text-muted)">
          Configure the transaction parameters for your proposal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <label
              htmlFor="amount-usd"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Amount (USD cents)
            </label>
            <Input
              id="amount-usd"
              placeholder="50000"
              type="number"
              value={form.amountUsd}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  amountUsd: e.target.value,
                }))
              }
            />
            <p className="text-[11px] text-(--text-muted) mt-1">
              ${(Number(form.amountUsd) / 100).toFixed(2)}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="target-chain"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Target chain
            </label>
            <Dropdown
              options={CHAINS.map((chain) => ({
                value: String(chain.code),
                label: chain.label,
              }))}
              value={form.chain}
              onChange={(value) =>
                setForm((current) => ({ ...current, chain: value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="transaction-type"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Transaction type
            </label>
            <Dropdown
              options={TX_TYPES.map((txType) => ({
                value: String(txType.code),
                label: txType.label,
              }))}
              value={form.txType}
              onChange={(value) =>
                setForm((current) => ({ ...current, txType: value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="quote-age"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Quote age (seconds)
            </label>
            <Input
              id="quote-age"
              placeholder="6"
              type="number"
              value={form.quoteAgeSecs}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  quoteAgeSecs: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <label
              htmlFor="risk-score"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Counterparty risk score
            </label>
            <Input
              id="risk-score"
              placeholder="18"
              type="number"
              value={form.counterpartyRiskScore}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  counterpartyRiskScore: e.target.value,
                }))
              }
            />
            <p className="text-[11px] text-(--text-muted) mt-1">0-100 scale</p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="protocol-id"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Protocol ID
            </label>
            <Input
              id="protocol-id"
              placeholder="Optional"
              value={form.protocolId}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  protocolId: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="expected-output"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Expected output (USD cents)
            </label>
            <Input
              id="expected-output"
              placeholder="Optional"
              type="number"
              value={form.expectedOutputUsd}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  expectedOutputUsd: e.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="actual-output"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
            >
              Actual output (USD cents)
            </label>
            <Input
              id="actual-output"
              placeholder="Optional"
              type="number"
              value={form.actualOutputUsd}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  actualOutputUsd: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="md:col-span-2 space-y-2">
          <label
            htmlFor="recipient"
            className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest block"
          >
            Recipient / contract address
          </label>
          <Input
            id="recipient"
            placeholder="0x7B2...E92 or contract address"
            value={form.recipient}
            onChange={(e) =>
              setForm((current) => ({ ...current, recipient: e.target.value }))
            }
          />
        </div>
      </div>
    </div>
  );
}
