"use client";

import { HelpCircle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Dropdown, Input } from "@/components/global";
import { Tooltip } from "@/components/global/Tooltip";
import { UsdInput } from "@/components/global/UsdInput";
import { CHAINS, TX_TYPES } from "@/lib/aura-app";

function FieldLabel({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string;
  label: string;
  tooltip: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-widest flex items-center gap-1.5"
    >
      {label}
      <Tooltip content={tooltip}>
        <HelpCircle className="size-3 text-(--text-muted) opacity-50 hover:opacity-100 transition-opacity" />
      </Tooltip>
    </label>
  );
}

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
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
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
            tooltip="The transaction amount in USD. Compared against the per-transaction and daily spending limits in the treasury policy."
            valueCents={form.amountUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, amountUsd: v }))
            }
          />

          <div className="space-y-2">
            <FieldLabel
              htmlFor="target-chain"
              label="Target chain"
              tooltip="The blockchain where this transaction executes. The treasury must have a registered dWallet for the selected chain."
            />
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
            <FieldLabel
              htmlFor="transaction-type"
              label="Transaction type"
              tooltip="Category of this transaction. Some policy rules apply per type — e.g. DeFi Swaps may have slippage checks, Bitcoin transfers may require manual review."
            />
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
            <FieldLabel
              htmlFor="quote-age"
              label="Quote age (seconds)"
              tooltip="How old the price quote is in seconds. Must be below the treasury's max quote age setting to prevent execution on stale pricing."
            />
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
            <FieldLabel
              htmlFor="risk-score"
              label="Counterparty risk score"
              tooltip="A 0–100 risk score for the recipient or protocol. Higher means more risk. Must not exceed the treasury's configured maximum counterparty risk score."
            />
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
            <FieldLabel
              htmlFor="protocol-id"
              label="Protocol ID"
              tooltip="Optional numeric identifier for DeFi protocols (e.g. Uniswap, Aave). Used for protocol allowlist checks — leave empty if not interacting with a specific protocol."
            />
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
            tooltip="Expected USD value to receive (for swaps). Used alongside Actual Output to compute slippage — leave empty if not a swap."
            valueCents={form.expectedOutputUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, expectedOutputUsd: v }))
            }
            placeholder="0.00"
          />

          <UsdInput
            label="Actual Output"
            tooltip="Actual USD value received (for swaps). Compared against Expected Output to detect excessive slippage against the policy limit."
            valueCents={form.actualOutputUsd}
            onChangeCents={(v) =>
              setForm((current) => ({ ...current, actualOutputUsd: v }))
            }
            placeholder="0.00"
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <FieldLabel
            htmlFor="recipient"
            label="Recipient / contract address"
            tooltip="Destination address for the transaction. For transfers this is the recipient wallet; for DeFi interactions this is the smart contract address."
          />
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
