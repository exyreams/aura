"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileSliders,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
  DashboardStatCard,
} from "@/components/dashboard/DashboardPrimitives";
import { Accordion } from "@/components/global/Accordion";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { Dropdown, type DropdownOption } from "@/components/global/Dropdown";
import { FieldGroup } from "@/components/global/FieldGroup";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Textarea } from "@/components/global/Textarea";
import { useToast } from "@/components/global/Toast";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAppSettings, useWalletRegistry } from "@/lib/hooks";
import {
  defaultPolicyTemplateConfigFields,
  POLICY_ANOMALY_ACTION_OPTIONS,
  POLICY_FAILURE_MODE_OPTIONS,
  POLICY_PRESET_OPTIONS,
  type PolicyTemplateConfigFields,
} from "@/lib/policies/policy-template-config";
import {
  buildApplyPolicyTemplateDraft,
  buildClosePolicyTemplateDraft,
  buildCreatePolicyTemplateDraft,
  buildUpdatePolicyTemplateDraft,
  type PolicyTemplateAction,
  type PolicyTemplateTransactionDraft,
  type PolicyTemplateView,
  simulatePolicyTemplateTransaction,
} from "@/lib/solana/policy-templates";
import type {
  TreasuryPolicySnapshotRow,
  WalletRegistryRow,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type ModalMode = PolicyTemplateAction | null;

type CachedPolicyTemplateView = PolicyTemplateView & {
  cache?: {
    kind: "supabase_policy_template_snapshot";
    status: "active" | "closed";
    lastSyncedAt: string;
    lastTxSignature: string | null;
    lastTxSlot: number | null;
  };
};

interface PolicyTemplateUsageBinding {
  snapshot: TreasuryPolicySnapshotRow;
  wallets: WalletRegistryRow[];
}

interface CachedPolicyTemplateData {
  templates: CachedPolicyTemplateView[];
  treasuryPolicySnapshots: TreasuryPolicySnapshotRow[];
  source: "supabase_cache" | "rpc_refresh";
  warning: string | null;
  cachedAt: string | null;
}

interface TreasuryOption {
  value: string;
  label: string;
  detail: string;
  wallet: WalletRegistryRow;
}

type ConfigFieldKind =
  | "number"
  | "checkbox"
  | "failure-mode"
  | "anomaly-action";

interface ConfigFieldSpec {
  key: keyof PolicyTemplateConfigFields;
  label: string;
  kind?: ConfigFieldKind;
  helper?: string;
  placeholder?: string;
}

interface ConfigSectionSpec {
  title: string;
  description: string;
  defaultOpen?: boolean;
  fields: ConfigFieldSpec[];
}

const CONFIG_SECTIONS: ConfigSectionSpec[] = [
  {
    title: "Core limits",
    description:
      "Primary USD caps and execution windows written into the template account.",
    defaultOpen: true,
    fields: [
      { key: "dailyLimitUsd", label: "Daily limit USD", placeholder: "10000" },
      { key: "perTxLimitUsd", label: "Per-tx limit USD", placeholder: "1000" },
      {
        key: "daytimeHourlyLimitUsd",
        label: "Daytime hourly USD",
        placeholder: "2500",
      },
      {
        key: "nighttimeHourlyLimitUsd",
        label: "Nighttime hourly USD",
        placeholder: "500",
      },
      {
        key: "velocityLimitUsd",
        label: "Velocity limit USD",
        placeholder: "5000",
      },
      {
        key: "sharedPoolLimitUsd",
        label: "Shared pool USD",
        helper: "Optional.",
      },
      { key: "weeklyLimitUsd", label: "Weekly limit USD", helper: "Optional." },
      {
        key: "monthlyLimitUsd",
        label: "Monthly limit USD",
        helper: "Optional.",
      },
    ],
  },
  {
    title: "Market and counterparty",
    description:
      "Risk thresholds used by the program's policy engine during proposal checks.",
    fields: [
      {
        key: "allowedProtocolBitmap",
        label: "Allowed protocol bitmap",
        placeholder: "31",
      },
      { key: "maxSlippageBps", label: "Max slippage bps", placeholder: "100" },
      {
        key: "maxQuoteAgeSecs",
        label: "Max quote age secs",
        helper: "Optional.",
      },
      {
        key: "maxCounterpartyRiskScore",
        label: "Max risk score",
        helper: "Optional.",
      },
      {
        key: "bitcoinManualReviewThresholdUsd",
        label: "Bitcoin review USD",
        placeholder: "5000",
      },
    ],
  },
  {
    title: "Cooldown and anomaly",
    description:
      "Optional pause windows and anomaly handling encoded into the template config.",
    fields: [
      { key: "cooldownEnabled", label: "Enable cooldown", kind: "checkbox" },
      { key: "cooldownThresholdUsd", label: "Cooldown threshold USD" },
      { key: "cooldownSecs", label: "Cooldown seconds" },
      { key: "anomalyEnabled", label: "Enable anomaly rule", kind: "checkbox" },
      { key: "anomalyThresholdBps", label: "Anomaly threshold bps" },
      { key: "anomalyMinSampleSize", label: "Anomaly min samples" },
      { key: "anomalyAction", label: "Anomaly action", kind: "anomaly-action" },
    ],
  },
  {
    title: "Reputation and approval ladder",
    description:
      "Dynamic limit multipliers and owner review escalation thresholds.",
    fields: [
      {
        key: "reputationHighScoreThreshold",
        label: "High score threshold",
      },
      {
        key: "reputationMediumScoreThreshold",
        label: "Medium score threshold",
      },
      {
        key: "reputationHighMultiplierBps",
        label: "High multiplier bps",
      },
      { key: "reputationLowMultiplierBps", label: "Low multiplier bps" },
      {
        key: "approvalEnabled",
        label: "Enable approval ladder",
        kind: "checkbox",
      },
      { key: "approvalGuardianAboveUsd", label: "Guardian above USD" },
      { key: "approvalMultisigAboveUsd", label: "Multisig above USD" },
      { key: "approvalTimelockAboveUsd", label: "Timelock above USD" },
      { key: "approvalDenyAboveUsd", label: "Deny above USD" },
      { key: "approvalRiskGuardianBps", label: "Risk guardian bps" },
      { key: "approvalRiskMultisigBps", label: "Risk multisig bps" },
      { key: "approvalRiskTimelockBps", label: "Risk timelock bps" },
      { key: "approvalTimelockSecs", label: "Timelock seconds" },
    ],
  },
  {
    title: "Liveness and failures",
    description:
      "Oracle freshness requirements and fail-open behavior when dependencies degrade.",
    fields: [
      {
        key: "livenessRequireEncryptFreshness",
        label: "Require Encrypt freshness",
        kind: "checkbox",
      },
      {
        key: "livenessRequireDwalletFreshness",
        label: "Require dWallet freshness",
        kind: "checkbox",
      },
      {
        key: "livenessRequireBalanceOracleFreshness",
        label: "Require balance oracle",
        kind: "checkbox",
      },
      {
        key: "livenessRequireComplianceOracleFreshness",
        label: "Require compliance oracle",
        kind: "checkbox",
      },
      { key: "livenessMaxStalenessSecs", label: "Max staleness secs" },
      {
        key: "failureQuoteFreshness",
        label: "Quote failure",
        kind: "failure-mode",
      },
      {
        key: "failureCounterpartyRisk",
        label: "Counterparty failure",
        kind: "failure-mode",
      },
      {
        key: "failureSlippage",
        label: "Slippage failure",
        kind: "failure-mode",
      },
      { key: "failureAnomaly", label: "Anomaly failure", kind: "failure-mode" },
      {
        key: "failureBalanceOracleStale",
        label: "Balance oracle failure",
        kind: "failure-mode",
      },
      {
        key: "failureComplianceOracle",
        label: "Compliance failure",
        kind: "failure-mode",
      },
      {
        key: "failureEncryptLiveness",
        label: "Encrypt liveness failure",
        kind: "failure-mode",
      },
      {
        key: "failureDwalletLiveness",
        label: "dWallet liveness failure",
        kind: "failure-mode",
      },
      { key: "failureMaxFailOpenUsd", label: "Max fail-open USD" },
      { key: "failureFailOpenWindowSecs", label: "Fail-open window secs" },
      { key: "failureFailOpenBudgetUsd", label: "Fail-open budget USD" },
      { key: "failureFailOpenMaxPerWindow", label: "Fail-open max count" },
      { key: "failureStaleFallbackLimitUsd", label: "Stale fallback USD" },
    ],
  },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Policy transaction failed.";
}

function isWalletRejection(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("reject") || message.includes("cancel");
}

function formatDate(timestamp: number) {
  if (!timestamp) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

function formatIsoDate(timestamp: string | null | undefined) {
  if (!timestamp) {
    return "Unknown";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUsdLimit(value: string | null | undefined) {
  const text = value?.trim();
  return text ? `$${text}` : "Not set";
}

function formatSolFee(lamports: number | null) {
  if (lamports === null) {
    return "Unavailable";
  }

  return `${(lamports / 1_000_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 9,
  })} SOL`;
}

function explorerAddress(address: string, network: string) {
  return `https://explorer.solana.com/address/${address}?cluster=${network}`;
}

function explorerTx(signature: string, network: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${network}`;
}

function walletDisplayName(wallet: WalletRegistryRow) {
  return (
    wallet.label?.trim() ||
    `${wallet.chain_name} ${wallet.wallet_kind.replaceAll("_", " ")}`
  );
}

function snapshotStatusTone(status: string | null | undefined) {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "stale") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function countOptionalControls(fields: PolicyTemplateConfigFields) {
  return [
    fields.cooldownEnabled,
    fields.anomalyEnabled,
    fields.approvalEnabled,
    fields.livenessRequireEncryptFreshness,
    fields.livenessRequireDwalletFreshness,
    fields.livenessRequireBalanceOracleFreshness,
    fields.livenessRequireComplianceOracleFreshness,
  ].filter(Boolean).length;
}

function nextTemplateId(templates: PolicyTemplateView[]) {
  const max = templates.reduce((current, template) => {
    const value = BigInt(template.templateId);
    return value > current ? value : current;
  }, BigInt(0));

  return (max + BigInt(1)).toString();
}

function templateEffectSummary(
  template: CachedPolicyTemplateView,
  usageCount: number,
) {
  const fields = template.configFields;
  const treasuryText =
    usageCount === 1
      ? "1 treasury currently references"
      : `${usageCount} treasuries currently reference`;

  return `${template.name} caps agent movement at ${formatUsdLimit(
    fields.perTxLimitUsd,
  )} per transaction and ${formatUsdLimit(
    fields.dailyLimitUsd,
  )} per day. ${treasuryText} this template through cached treasury snapshots.`;
}

function cacheSummary(template: CachedPolicyTemplateView) {
  if (!template.cache) {
    return "Snapshot cache unavailable in this response.";
  }

  const slot = template.cache.lastTxSlot
    ? `slot ${template.cache.lastTxSlot}`
    : "no slot recorded";

  return `${template.cache.status} snapshot synced ${formatIsoDate(
    template.cache.lastSyncedAt,
  )}; ${slot}.`;
}

function groupUsageByTemplate(rows: TreasuryPolicySnapshotRow[]) {
  const byTemplate = new Map<string, TreasuryPolicySnapshotRow[]>();

  for (const row of rows) {
    if (!row.template_pda) {
      continue;
    }

    const existing = byTemplate.get(row.template_pda) ?? [];
    existing.push(row);
    byTemplate.set(row.template_pda, existing);
  }

  return byTemplate;
}

function usageBindings(
  snapshots: TreasuryPolicySnapshotRow[],
  wallets: WalletRegistryRow[],
): PolicyTemplateUsageBinding[] {
  const walletsByTreasury = new Map<string, WalletRegistryRow[]>();

  for (const wallet of wallets) {
    if (!wallet.treasury_pda) {
      continue;
    }

    const existing = walletsByTreasury.get(wallet.treasury_pda) ?? [];
    existing.push(wallet);
    walletsByTreasury.set(wallet.treasury_pda, existing);
  }

  return snapshots.map((snapshot) => ({
    snapshot,
    wallets: walletsByTreasury.get(snapshot.treasury_pda) ?? [],
  }));
}

function sourcePresetOptions(): DropdownOption[] {
  return [
    { value: "", label: "Custom config", badge: "local" },
    ...POLICY_PRESET_OPTIONS.map((option) => ({
      value: String(option.value),
      label: option.label,
      badge: String(option.value),
    })),
  ];
}

function failureModeOptions(): DropdownOption[] {
  return POLICY_FAILURE_MODE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    badge: option.badge,
  }));
}

function anomalyActionOptions(): DropdownOption[] {
  return POLICY_ANOMALY_ACTION_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    badge: option.badge,
  }));
}

function configSectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "");
}

function treasuryOptions(wallets: WalletRegistryRow[]): TreasuryOption[] {
  const byTreasury = new Map<string, TreasuryOption>();

  for (const wallet of wallets) {
    if (!wallet.treasury_pda) {
      continue;
    }

    if (byTreasury.has(wallet.treasury_pda)) {
      continue;
    }

    byTreasury.set(wallet.treasury_pda, {
      value: wallet.treasury_pda,
      label: walletDisplayName(wallet),
      detail: `${formatAddress(wallet.treasury_pda)} via ${formatAddress(
        wallet.chain_address,
      )}`,
      wallet,
    });
  }

  return [...byTreasury.values()];
}

async function confirmPolicyTemplateTransaction(
  draft: PolicyTemplateTransactionDraft,
  signature: string,
  input: {
    network: string;
    programId: string | null;
  },
) {
  const response = await fetch("/api/policies/templates/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: draft.action,
      signature,
      ownerAddress: draft.ownerAddress,
      templateId: draft.templateId,
      templateAddress: draft.templateAddress,
      templateName: draft.templateName,
      treasuryPda: draft.treasuryPda,
      sourcePreset: draft.sourcePreset,
      shared: draft.shared,
      cluster: input.network,
      programId: input.programId,
      blockhash: draft.blockhash,
      feeLamports: draft.feeLamports,
    }),
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(
      payload.error ?? "Could not record confirmed policy transaction.",
    );
  }
}

interface PolicyTemplatesResponse {
  templates?: CachedPolicyTemplateView[];
  treasuryPolicySnapshots?: TreasuryPolicySnapshotRow[];
  source?: "supabase_cache" | "rpc_refresh";
  warning?: string | null;
  cachedAt?: string | null;
  error?: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.trim() || "Could not load policy templates.");
  }
}

async function loadCachedPolicyTemplates(input: {
  ownerAddress: string;
  network: string;
  programId: string | null;
  refresh?: boolean;
}) {
  const params = new URLSearchParams({
    owner: input.ownerAddress,
    cluster: input.network,
  });

  if (input.programId) {
    params.set("programId", input.programId);
  }

  if (input.refresh) {
    params.set("refresh", "1");
  }

  const response = await fetch(`/api/policies/templates?${params.toString()}`, {
    credentials: "same-origin",
  });
  const payload = await parseJsonResponse<PolicyTemplatesResponse>(response);

  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not load policy templates.");
  }

  return {
    templates: payload?.templates ?? [],
    treasuryPolicySnapshots: payload?.treasuryPolicySnapshots ?? [],
    source: payload?.source ?? "supabase_cache",
    warning: payload?.warning ?? null,
    cachedAt: payload?.cachedAt ?? null,
  } satisfies CachedPolicyTemplateData;
}

function emptyCachedPolicyTemplateData(): CachedPolicyTemplateData {
  return {
    templates: [],
    treasuryPolicySnapshots: [],
    source: "supabase_cache",
    warning: null,
    cachedAt: null,
  };
}

function TemplateListItem({
  template,
  selected,
  onSelect,
}: {
  template: CachedPolicyTemplateView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-24 w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
        <FileSliders className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {template.name}
          </p>
          <StatusBadge tone={template.shared ? "success" : "neutral"}>
            {template.shared ? "shared" : "private"}
          </StatusBadge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {template.description || "No description"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
            id {template.templateId}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
            v{template.version}
          </span>
          {template.sourcePresetLabel ? (
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
              {template.sourcePresetLabel}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function DetailRow({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string;
  href?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate text-sm text-foreground",
            mono && "font-mono",
          )}
          title={value}
        >
          {mono ? formatAddress(value) : value}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Open ${label} in explorer`}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function CompactDetailRow({
  label,
  value,
  mono = false,
  wrap = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  const displayValue = mono && value.length > 24 ? formatAddress(value) : value;

  return (
    <div className="flex items-start gap-2 font-mono text-[10px] sm:gap-3">
      <span className="w-24 shrink-0 text-muted-foreground sm:w-36">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-foreground",
          mono && "font-mono",
          wrap ? "break-words leading-5" : "truncate",
        )}
        title={value}
      >
        {displayValue}
      </span>
    </div>
  );
}

function DetailActionLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className =
    "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

function GuardrailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function TemplateUsageRow({
  binding,
  network,
}: {
  binding: PolicyTemplateUsageBinding;
  network: string;
}) {
  const { snapshot, wallets } = binding;
  const walletLabel =
    wallets.length > 0
      ? wallets.map((wallet) => walletDisplayName(wallet)).join(", ")
      : "Unregistered treasury";
  const walletMeta =
    wallets.length > 0
      ? wallets
          .map(
            (wallet) =>
              `${wallet.chain_name} ${formatAddress(wallet.chain_address)}`,
          )
          .join(" · ")
      : "No wallet registry row currently matches this treasury PDA.";

  return (
    <div className="px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate font-mono text-[10px] font-bold uppercase tracking-wide text-foreground">
              {walletLabel}
            </p>
            <StatusBadge
              tone={snapshotStatusTone(snapshot.status)}
              className="px-1.5 py-0.5 text-[9px]"
            >
              {snapshot.status}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {walletMeta}
          </p>
        </div>
        <a
          href={explorerAddress(snapshot.treasury_pda, network)}
          target="_blank"
          rel="noreferrer"
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Open treasury PDA in explorer"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>
      <div className="mt-3 space-y-1.5">
        <CompactDetailRow
          label="Treasury PDA"
          value={snapshot.treasury_pda}
          mono
        />
        <CompactDetailRow
          label="Policy version"
          value={
            snapshot.policy_version === null
              ? "Unknown"
              : `v${snapshot.policy_version}`
          }
        />
        <CompactDetailRow
          label="Last synced"
          value={formatIsoDate(snapshot.last_synced_at)}
        />
        {snapshot.last_tx_signature ? (
          <CompactDetailRow
            label="Last tx"
            value={snapshot.last_tx_signature}
            mono
          />
        ) : null}
      </div>
    </div>
  );
}

function TemplateUsagePanel({
  bindings,
  network,
}: {
  bindings: PolicyTemplateUsageBinding[];
  network: string;
}) {
  const countLabel =
    bindings.length === 1 ? "1 treasury" : `${bindings.length} treasuries`;

  return (
    <div
      className="overflow-hidden rounded-sm border border-border"
      style={{ background: "var(--accordion-bg)" }}
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Wallet
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-foreground">
              Wallets using this policy
            </p>
          </div>
          <StatusBadge tone={bindings.length > 0 ? "success" : "neutral"}>
            {countLabel}
          </StatusBadge>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          These rows come from confirmed treasury snapshots; the program account
          remains the source of truth.
        </p>
      </div>

      <div
        className="divide-y divide-border"
        style={{ background: "var(--accordion-content)" }}
      >
        {bindings.length > 0 ? (
          bindings.map((binding) => (
            <TemplateUsageRow
              key={binding.snapshot.treasury_pda}
              binding={binding}
              network={network}
            />
          ))
        ) : (
          <div className="px-3 py-4 text-sm leading-6 text-muted-foreground">
            No active treasury snapshot points at this template yet. Apply it to
            a treasury to bind wallets to this policy.
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  network,
  treasuryCount,
  usageBindings,
  onAction,
}: {
  template: CachedPolicyTemplateView;
  network: string;
  treasuryCount: number;
  usageBindings: PolicyTemplateUsageBinding[];
  onAction: (mode: Exclude<ModalMode, null>) => void;
}) {
  const fields = template.configFields;

  return (
    <DashboardPanel className="grid gap-5">
      <DashboardPanelHeader
        eyebrow="On-chain template"
        title={template.name}
        description={
          template.description ||
          "The AURA program account is the source of truth; Supabase caches confirmed snapshots for fast reads."
        }
        action={
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onAction("update")}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
            <Button
              type="button"
              onClick={() => onAction("apply")}
              disabled={treasuryCount === 0}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Apply
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => onAction("close")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Close
            </Button>
          </div>
        }
      />

      <div className="grid gap-2">
        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
          {templateEffectSummary(template, usageBindings.length)}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Source of truth stays on chain. Supabase keeps the confirmed snapshot
          for fast reads.
        </p>
      </div>

      <div className="space-y-1.5">
        <CompactDetailRow label="Template PDA" value={template.address} mono />
        <CompactDetailRow label="Owner" value={template.owner} mono />
        <CompactDetailRow
          label="Template ID"
          value={template.templateId}
          mono
        />
        <CompactDetailRow label="Version" value={`v${template.version}`} />
        <CompactDetailRow
          label="Source preset"
          value={template.sourcePresetLabel ?? "Custom config"}
        />
        <CompactDetailRow
          label="On-chain update"
          value={formatDate(template.updatedAt)}
        />
        <CompactDetailRow
          label="Cached snapshot"
          value={cacheSummary(template)}
          wrap
        />
        <CompactDetailRow label="Applied count" value={template.appliedCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <DetailActionLink
          href={explorerAddress(template.address, network)}
          external
        >
          Template
        </DetailActionLink>
        <DetailActionLink href="/dashboard/wallets">Wallets</DetailActionLink>
        <DetailActionLink href="/dashboard/activity">Activity</DetailActionLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GuardrailStat
          label="Daily cap"
          value={formatUsdLimit(fields.dailyLimitUsd)}
        />
        <GuardrailStat
          label="Per tx cap"
          value={formatUsdLimit(fields.perTxLimitUsd)}
        />
        <GuardrailStat
          label="Slippage"
          value={`${fields.maxSlippageBps} bps`}
        />
        <GuardrailStat
          label="Optional controls"
          value={String(countOptionalControls(fields))}
        />
      </div>

      <TemplateUsagePanel bindings={usageBindings} network={network} />
    </DashboardPanel>
  );
}

function ConfigField({
  field,
  fields,
  onChange,
}: {
  field: ConfigFieldSpec;
  fields: PolicyTemplateConfigFields;
  onChange: (
    key: keyof PolicyTemplateConfigFields,
    value: string | boolean,
  ) => void;
}) {
  if (field.kind === "checkbox") {
    return (
      <Checkbox
        checked={Boolean(fields[field.key])}
        onChange={(checked) => onChange(field.key, checked)}
        className="min-h-11 rounded-md border border-border bg-background px-3 py-3"
      >
        <span className="text-sm text-foreground">{field.label}</span>
      </Checkbox>
    );
  }

  if (field.kind === "failure-mode" || field.kind === "anomaly-action") {
    return (
      <Dropdown
        label={field.label}
        value={String(fields[field.key])}
        onChange={(value) => onChange(field.key, value)}
        options={
          field.kind === "failure-mode"
            ? failureModeOptions()
            : anomalyActionOptions()
        }
      />
    );
  }

  return (
    <Input
      label={field.label}
      value={String(fields[field.key] ?? "")}
      onChange={(event) => onChange(field.key, event.target.value)}
      inputMode="numeric"
      placeholder={field.placeholder}
      helperText={field.helper}
    />
  );
}

function ConfigEditor({
  fields,
  onChange,
}: {
  fields: PolicyTemplateConfigFields;
  onChange: (fields: PolicyTemplateConfigFields) => void;
}) {
  const setField = (
    key: keyof PolicyTemplateConfigFields,
    value: string | boolean,
  ) => {
    onChange({ ...fields, [key]: value } as PolicyTemplateConfigFields);
  };
  const defaultOpenSection =
    CONFIG_SECTIONS.find((section) => section.defaultOpen) ??
    CONFIG_SECTIONS[0];

  return (
    <Accordion
      defaultOpen={
        defaultOpenSection
          ? configSectionId(defaultOpenSection.title)
          : undefined
      }
      items={CONFIG_SECTIONS.map((section) => ({
        id: configSectionId(section.title),
        title: section.title,
        description: section.description,
        content: (
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <ConfigField
                key={String(field.key)}
                field={field}
                fields={fields}
                onChange={setField}
              />
            ))}
          </div>
        ),
      }))}
    />
  );
}

function ActionEffectSummary({
  mode,
  template,
  selectedTreasury,
  customConfig,
  usageBindings,
}: {
  mode: Exclude<ModalMode, null>;
  template: CachedPolicyTemplateView | null;
  selectedTreasury: TreasuryOption | null;
  customConfig: boolean;
  usageBindings: PolicyTemplateUsageBinding[];
}) {
  const templateName = template?.name ?? "New template";
  const boundText =
    usageBindings.length === 1
      ? "1 treasury currently references it"
      : `${usageBindings.length} treasuries currently reference it`;
  const title =
    mode === "create"
      ? "Create transition"
      : mode === "update"
        ? "Update transition"
        : mode === "apply"
          ? "Apply transition"
          : "Close transition";
  const summary =
    mode === "create"
      ? "Creates a PolicyTemplate PDA owned by the connected owner wallet."
      : mode === "update"
        ? `Updates ${templateName} on the existing PolicyTemplate PDA.`
        : mode === "apply"
          ? `Applies ${templateName} to the selected treasury account.`
          : `Closes ${templateName} on-chain; existing treasury configs are not rolled back.`;
  const onchainEffect =
    mode === "create"
      ? customConfig
        ? "Program stores a custom policy config record in the new template account."
        : "Program stores the selected built-in preset config in the new template account."
      : mode === "update"
        ? "Program replaces the template name, description, sharing flag, and config."
        : mode === "apply"
          ? "Program writes the template config into the target treasury policy account."
          : "Program closes the template account and returns rent to the owner wallet.";
  const cacheEffect =
    mode === "close"
      ? "After confirmation, Supabase marks the template snapshot closed. Treasury snapshots keep their last applied config."
      : mode === "apply"
        ? "After confirmation, Supabase refreshes the template snapshot and the target treasury policy snapshot."
        : "After confirmation, Supabase refreshes the template snapshot from the program account.";
  const target =
    mode === "apply"
      ? selectedTreasury
        ? `${selectedTreasury.label} · ${formatAddress(selectedTreasury.value)}`
        : "Choose a treasury"
      : (template?.address ?? "Derived after template ID is entered");

  return (
    <div
      className="overflow-hidden rounded-sm border border-border"
      style={{ background: "var(--accordion-bg)" }}
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-foreground">
            {title}
          </span>
          <StatusBadge tone="success" className="px-1.5 py-0.5 text-[9px]">
            on-chain
          </StatusBadge>
          <StatusBadge tone="neutral" className="px-1.5 py-0.5 text-[9px]">
            cached after confirm
          </StatusBadge>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {summary}
        </p>
      </div>
      <div
        className="space-y-1.5 px-3 py-2.5"
        style={{ background: "var(--accordion-content)" }}
      >
        <CompactDetailRow label="On-chain effect" value={onchainEffect} wrap />
        <CompactDetailRow label="Cached effect" value={cacheEffect} wrap />
        <CompactDetailRow
          label={mode === "apply" ? "Target treasury" : "Template PDA"}
          value={target}
          mono={target.length > 32}
        />
        {mode === "close" ? (
          <CompactDetailRow label="Current bindings" value={boundText} />
        ) : null}
      </div>
    </div>
  );
}

function ActionModal({
  mode,
  template,
  usageBindings,
  treasuryOptionsList,
  defaultTemplateId,
  onClose,
  onSubmitted,
}: {
  mode: Exclude<ModalMode, null>;
  template: CachedPolicyTemplateView | null;
  usageBindings: PolicyTemplateUsageBinding[];
  treasuryOptionsList: TreasuryOption[];
  defaultTemplateId: string;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const { connection } = useConnection();
  const walletAdapter = useWallet();
  const settings = useAppSettings();
  const toast = useToast();
  const [phase, setPhase] = useState<"form" | "review" | "success">("form");
  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(false);
  const [sourcePreset, setSourcePreset] = useState("");
  const [configFields, setConfigFields] = useState<PolicyTemplateConfigFields>(
    () => defaultPolicyTemplateConfigFields(),
  );
  const [treasuryPda, setTreasuryPda] = useState("");
  const [draft, setDraft] = useState<PolicyTemplateTransactionDraft | null>(
    null,
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === "create";
  const isEdit = mode === "update";
  const isApply = mode === "apply";
  const isClose = mode === "close";
  const customConfig = sourcePreset === "";
  const selectedTreasury =
    treasuryOptionsList.find((option) => option.value === treasuryPda) ?? null;

  useEffect(() => {
    setPhase("form");
    setDraft(null);
    setSignature(null);
    setBusy(false);
    setError(null);

    if (mode === "create") {
      setTemplateId(defaultTemplateId);
      setName("");
      setDescription("");
      setShared(false);
      setSourcePreset("");
      setConfigFields(defaultPolicyTemplateConfigFields());
      return;
    }

    if (template) {
      setTemplateId(template.templateId);
      setName(template.name);
      setDescription(template.description);
      setShared(template.shared);
      setSourcePreset("");
      setConfigFields(template.configFields);
    }

    setTreasuryPda(treasuryOptionsList[0]?.value ?? "");
  }, [defaultTemplateId, mode, template, treasuryOptionsList]);

  const modalTitle =
    mode === "create"
      ? "Create policy template"
      : mode === "update"
        ? "Update policy template"
        : mode === "apply"
          ? "Apply policy template"
          : "Close policy template";

  const prepareDraft = async () => {
    setBusy(true);
    setError(null);

    try {
      let nextDraft: PolicyTemplateTransactionDraft;
      const programId = settings.resolvedProgramId;

      if (isCreate) {
        nextDraft = await buildCreatePolicyTemplateDraft({
          connection,
          walletAdapter,
          programId,
          templateId,
          name,
          description,
          shared,
          sourcePreset: customConfig ? null : Number(sourcePreset),
          configFields,
        });
      } else if (isEdit && template) {
        nextDraft = await buildUpdatePolicyTemplateDraft({
          connection,
          walletAdapter,
          programId,
          template,
          name,
          description,
          shared,
          configFields,
        });
      } else if (isApply && template && selectedTreasury) {
        nextDraft = await buildApplyPolicyTemplateDraft({
          connection,
          walletAdapter,
          programId,
          template,
          treasuryPda: selectedTreasury.value,
          treasuryLabel: selectedTreasury.label,
        });
      } else if (isClose && template) {
        nextDraft = await buildClosePolicyTemplateDraft({
          connection,
          walletAdapter,
          programId,
          template,
        });
      } else {
        throw new Error("Choose a policy template and target treasury first.");
      }

      await simulatePolicyTemplateTransaction(connection, nextDraft);
      setDraft(nextDraft);
      setPhase("review");
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const sendDraft = async () => {
    if (!draft) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const txSignature = await walletAdapter.sendTransaction(
        draft.transaction,
        connection,
        { preflightCommitment: "confirmed" },
      );
      await connection.confirmTransaction(
        {
          signature: txSignature,
          blockhash: draft.blockhash,
          lastValidBlockHeight: draft.lastValidBlockHeight,
        },
        "confirmed",
      );
      await confirmPolicyTemplateTransaction(draft, txSignature, {
        network: settings.network,
        programId: settings.resolvedProgramId?.toBase58() ?? null,
      });
      await onSubmitted();
      setSignature(txSignature);
      setPhase("success");
      toast.success(`${draft.title} confirmed`, {
        description: "The AURA program accepted the policy transaction.",
        action: {
          label: "View transaction",
          href: explorerTx(txSignature, settings.network),
        },
      });
    } catch (cause) {
      if (isWalletRejection(cause)) {
        setPhase("form");
        return;
      }

      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const canPrepare =
    !busy &&
    (isCreate ||
      Boolean(template && (isEdit || isClose)) ||
      Boolean(template && selectedTreasury && isApply));

  return (
    <Modal
      isOpen
      onClose={busy ? () => undefined : onClose}
      ariaLabelledBy="policy-template-action-title"
      ariaDescribedBy="policy-template-action-description"
      className="sm:max-w-4xl"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2
            id="policy-template-action-title"
            className="text-lg font-semibold"
          >
            {modalTitle}
          </h2>
          <p
            id="policy-template-action-description"
            className="mt-1 text-sm leading-6 text-muted-foreground"
          >
            Owner wallet signature required. Simulation runs before signing.
          </p>
        </div>

        {phase !== "success" ? (
          <ActionEffectSummary
            mode={mode}
            template={template}
            selectedTreasury={selectedTreasury}
            customConfig={customConfig}
            usageBindings={usageBindings}
          />
        ) : null}

        {phase === "success" ? (
          <div className="rounded-md border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 size-5 text-success"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-semibold text-success">
                  Transaction confirmed
                </p>
                {signature ? (
                  <a
                    href={explorerTx(signature, settings.network)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    View transaction
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : phase === "review" && draft ? (
          <div className="grid gap-4">
            <div className="rounded-md border border-success/30 bg-success/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 text-success"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold text-success">
                    Simulation passed
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Review the exact accounts and estimated network fee before
                    signing.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {draft.details.map((detail) => (
                <DetailRow
                  key={`${detail.label}-${detail.value}`}
                  label={detail.label}
                  value={detail.value}
                  mono={detail.mono}
                  href={
                    detail.mono && detail.value.length > 32
                      ? explorerAddress(detail.value, settings.network)
                      : null
                  }
                />
              ))}
              <DetailRow
                label="Fee payer"
                value={draft.ownerAddress}
                mono
                href={explorerAddress(draft.ownerAddress, settings.network)}
              />
              <DetailRow
                label="Estimated network fee"
                value={formatSolFee(draft.feeLamports)}
              />
              <DetailRow label="Cluster" value={settings.network} />
            </div>
            {error ? <InlineError message={error} /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPhase("form")}
                disabled={busy}
              >
                Back
              </Button>
              <Button type="button" onClick={sendDraft} loading={busy}>
                Sign and send
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            {isCreate || isEdit ? (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                  <Input
                    label="Template ID"
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value)}
                    inputMode="numeric"
                    disabled={!isCreate}
                  />
                  <Input
                    label="Template name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={48}
                    placeholder="AI agent ops"
                  />
                </div>
                <Textarea
                  label="Description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={160}
                  placeholder="Reusable policy posture for an owner-controlled treasury."
                />
                <Checkbox checked={shared} onChange={setShared}>
                  <span className="text-sm text-foreground">
                    Allow other owners to apply this template when shared.
                  </span>
                </Checkbox>
                {isCreate ? (
                  <Dropdown
                    label="Source"
                    value={sourcePreset}
                    onChange={setSourcePreset}
                    options={sourcePresetOptions()}
                  />
                ) : null}
                {!customConfig && isCreate ? (
                  <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-sm font-semibold">
                      Built-in preset fork
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      The transaction stores the template account on-chain and
                      lets the AURA program build the selected preset config.
                    </p>
                  </div>
                ) : (
                  <ConfigEditor
                    fields={configFields}
                    onChange={setConfigFields}
                  />
                )}
              </>
            ) : null}

            {isApply ? (
              <FieldGroup
                label="Target treasury"
                description="The selected AURA treasury account receives the template config on-chain."
              >
                {treasuryOptionsList.length > 0 ? (
                  <Dropdown
                    value={treasuryPda}
                    onChange={setTreasuryPda}
                    options={treasuryOptionsList.map((option) => ({
                      value: option.value,
                      label: option.label,
                      badge: option.wallet.chain_name,
                    }))}
                  />
                ) : (
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
                    Link a signer agent treasury before applying a template.
                  </div>
                )}
              </FieldGroup>
            ) : null}

            {isClose && template ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="mt-0.5 size-5 text-danger"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-danger">
                      Close template PDA
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      This closes {template.name} on-chain and returns rent to
                      the owner wallet. Existing treasuries keep any config
                      already applied from this template.
                    </p>
                    {usageBindings.length > 0 ? (
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-danger">
                        {usageBindings.length} bound{" "}
                        {usageBindings.length === 1 ? "treasury" : "treasuries"}{" "}
                        in cache
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <InlineError message={error} /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={prepareDraft}
                loading={busy}
                disabled={!canPrepare}
              >
                Review transaction
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/10 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-danger"
          aria-hidden="true"
        />
        <p className="text-sm leading-6 text-danger">{message}</p>
      </div>
    </div>
  );
}

export function PolicyTemplateManager() {
  const walletAdapter = useWallet();
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const walletsQuery = useWalletRegistry();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const owner = walletAdapter.publicKey ?? null;
  const ownerAddress = owner?.toBase58() ?? null;
  const policyProgramId = settings.resolvedProgramId?.toBase58() ?? null;
  const policyTemplatesQueryKey = [
    "policy-templates",
    settings.network,
    settings.resolvedProgramId?.toBase58() ?? settings.programId,
    ownerAddress,
  ];
  const templatesQuery = useQuery<CachedPolicyTemplateData>({
    queryKey: policyTemplatesQueryKey,
    queryFn: () =>
      ownerAddress
        ? loadCachedPolicyTemplates({
            ownerAddress,
            network: settings.network,
            programId: policyProgramId,
          })
        : Promise.resolve(emptyCachedPolicyTemplateData()),
    enabled: Boolean(ownerAddress),
    staleTime: 30_000,
  });
  const templates = templatesQuery.data?.templates ?? [];
  const treasuryPolicySnapshots =
    templatesQuery.data?.treasuryPolicySnapshots ?? [];
  const selectedTemplate =
    templates.find((template) => template.address === selectedAddress) ??
    templates[0] ??
    null;
  const wallets = walletsQuery.data ?? [];
  const treasuryOptionsList = useMemo(
    () => treasuryOptions(wallets),
    [wallets],
  );
  const usageByTemplate = useMemo(
    () => groupUsageByTemplate(treasuryPolicySnapshots),
    [treasuryPolicySnapshots],
  );
  const selectedUsageBindings = useMemo(() => {
    if (!selectedTemplate) {
      return [];
    }

    return usageBindings(
      usageByTemplate.get(selectedTemplate.address) ?? [],
      wallets,
    );
  }, [selectedTemplate, usageByTemplate, wallets]);
  const nextId = useMemo(() => nextTemplateId(templates), [templates]);
  const sharedCount = templates.filter((template) => template.shared).length;
  const appliedCount = templates.reduce(
    (total, template) => total + BigInt(template.appliedCount),
    BigInt(0),
  );
  const boundTreasuryCount = treasuryPolicySnapshots.filter(
    (snapshot) => snapshot.template_pda,
  ).length;

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedAddress(null);
      return;
    }

    if (selectedAddress !== selectedTemplate.address) {
      setSelectedAddress(selectedTemplate.address);
    }
  }, [selectedAddress, selectedTemplate]);

  const refreshTemplates = async () => {
    if (!ownerAddress) {
      return;
    }

    await queryClient.fetchQuery({
      queryKey: policyTemplatesQueryKey,
      queryFn: () =>
        loadCachedPolicyTemplates({
          ownerAddress,
          network: settings.network,
          programId: policyProgramId,
          refresh: true,
        }),
      staleTime: 0,
    });
  };

  const handleSubmitted = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["policy-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
    ]);
  };

  return (
    <div className="grid w-full gap-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Policies
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            On-chain policy templates
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Create reusable AURA policy templates as Solana program accounts.
            The dashboard reads confirmed Supabase snapshots and only refreshes
            RPC when requested or missing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void refreshTemplates().catch((cause) => {
                toast.danger("Policy refresh failed", {
                  description: getErrorMessage(cause),
                });
              });
            }}
            disabled={!owner || templatesQuery.isFetching}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => setModalMode("create")}
            disabled={!owner}
          >
            <Plus className="size-4" aria-hidden="true" />
            New template
          </Button>
        </div>
      </div>

      {!owner ? (
        <DashboardEmptyState
          icon={Wallet}
          title="Connect the owner wallet"
          description="Policy templates are owner-scoped Solana accounts. Connect the wallet that owns the AURA treasuries before creating or applying templates."
        />
      ) : templatesQuery.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <DashboardPanel className="grid gap-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </DashboardPanel>
          <DashboardPanel className="grid gap-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </DashboardPanel>
        </div>
      ) : templatesQuery.isError ? (
        <DashboardErrorState
          title="Could not load policy templates"
          description={getErrorMessage(templatesQuery.error)}
          onRetry={() => void templatesQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <DashboardStatCard
              icon={FileSliders}
              label="Templates"
              value={String(templates.length)}
              detail="Cached snapshots of PolicyTemplate accounts owned by the connected wallet."
            />
            <DashboardStatCard
              icon={ShieldCheck}
              label="Shared"
              value={String(sharedCount)}
              detail="Templates that other owners may apply with attribution."
            />
            <DashboardStatCard
              icon={Wallet}
              label="Bound treasuries"
              value={String(boundTreasuryCount)}
              detail={`${treasuryOptionsList.length} available treasuries; ${appliedCount.toString()} total applies recorded on-chain.`}
            />
          </div>

          {templates.length === 0 ? (
            <DashboardEmptyState
              icon={FileSliders}
              title="No on-chain templates"
              description="Create the first policy template PDA for this owner wallet. The AURA program stores the config; Supabase stores the confirmed snapshot for faster dashboard reads."
              action={
                <Button type="button" onClick={() => setModalMode("create")}>
                  <Plus className="size-4" aria-hidden="true" />
                  New template
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
              <DashboardPanel className="overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Template registry</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {ownerAddress ? formatAddress(ownerAddress) : "No owner"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => setModalMode("create")}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    New
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {templates.map((template) => (
                    <TemplateListItem
                      key={template.address}
                      template={template}
                      selected={template.address === selectedTemplate?.address}
                      onSelect={() => setSelectedAddress(template.address)}
                    />
                  ))}
                </div>
              </DashboardPanel>

              {selectedTemplate ? (
                <TemplateDetail
                  template={selectedTemplate}
                  network={settings.network}
                  treasuryCount={treasuryOptionsList.length}
                  usageBindings={selectedUsageBindings}
                  onAction={(mode) => setModalMode(mode)}
                />
              ) : (
                <DashboardEmptyState
                  icon={FileSliders}
                  title="Select a template"
                  description="Choose a policy template to view its PDA, source preset, version, and key guardrail fields."
                />
              )}
            </div>
          )}
        </>
      )}

      {modalMode ? (
        <ActionModal
          mode={modalMode}
          template={selectedTemplate}
          usageBindings={selectedUsageBindings}
          treasuryOptionsList={treasuryOptionsList}
          defaultTemplateId={nextId}
          onClose={() => setModalMode(null)}
          onSubmitted={handleSubmitted}
        />
      ) : null}
    </div>
  );
}
