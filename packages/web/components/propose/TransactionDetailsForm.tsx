"use client";

import type { Dispatch, SetStateAction } from "react";
import { Dropdown, Input } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
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
          <UsdInput
            label="Amount"
            valueCents={form.amountUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, amountUsd: v }))
            }
          />

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

          <UsdInput
            label="Expected Output"
            valueCents={form.expectedOutputUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, expectedOutputUsd: v }))
            }
            placeholder="0.00"
          />

          <UsdInput
            label="Actual Output"
            valueCents={form.actualOutputUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, actualOutputUsd: v }))
            }
            placeholder="0.00"
          />
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
