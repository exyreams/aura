"use client";

import type { PublicKey } from "@solana/web3.js";
import Image from "next/image";
import { useState } from "react";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Progress } from "@/components/global/Progress";
import { Tabs } from "@/components/global/Tabs";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  Shield,
  ShieldCheck,
} from "@/components/icons";
import { CHAINS } from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAppSettings, useDWalletLiveBalance } from "@/lib/hooks";
import { cn, formatCurrency, shortenAddress } from "@/lib/utils";

/**
 * Convert raw 32-byte Uint8Array to base58 (same encoding as Solana PublicKey).
 * Used to fix legacy dWallet addresses stored as base64.
 */
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--)
    result += BASE58_ALPHABET[digits[i]];
  return result;
}

// ---------------------------------------------------------------------------
// Policy label tooltips
// ---------------------------------------------------------------------------
const POLICY_TOOLTIPS: Record<string, string> = {
  "DAILY LIMIT": "Maximum USD spend allowed per 24-hour rolling window",
  "PER-TX LIMIT": "Maximum USD amount per individual transaction",
  "DAYTIME HOURLY": "Hourly spend cap during daytime hours (6am–10pm)",
  "NIGHTTIME HOURLY": "Hourly spend cap during nighttime hours (10pm–6am)",
  "VELOCITY LIMIT":
    "Maximum spend across recent transactions in a sliding window",
  "MAX SLIPPAGE":
    "Maximum allowed price slippage in basis points (1 bps = 0.01%)",
  "MAX QUOTE AGE": "Maximum age of oracle price quotes accepted for validation",
  "MAX RISK SCORE":
    "Maximum counterparty risk score (0=lowest risk, 100=highest)",
  "SHARED POOL": "Shared spending pool limit for swarm agents",
};

// ---------------------------------------------------------------------------
// Module-level sub-components (lifted out to avoid re-creation on each render)
// ---------------------------------------------------------------------------

function AddressField({
  label,
  value,
  fieldKey,
  copiedField,
  onCopy,
  network,
}: {
  label: string;
  value: string;
  fieldKey: string;
  copiedField: string | null;
  onCopy: (value: string, key: string) => void;
  network: string;
}) {
  const isCopied = copiedField === fieldKey;
  return (
    <div className="py-2 border-b border-border last:border-0">
      <span className="mono text-[9px] uppercase text-(--text-muted) tracking-wider block mb-1">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Tooltip content={value}>
          <span className="mono text-[11px] text-(--text-main) cursor-default">
            {shortenAddress(value, 10, 8)}
          </span>
        </Tooltip>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip content={isCopied ? "Copied!" : "Copy"}>
            <span>
              <button
                type="button"
                onClick={() => onCopy(value, fieldKey)}
                className="p-0.5 rounded text-(--text-muted) hover:text-(--text-main) transition-colors"
              >
                {isCopied ? (
                  <Check size={12} animateOnHover className="text-active" />
                ) : (
                  <Copy size={12} animateOnHover />
                )}
              </button>
            </span>
          </Tooltip>
          <Tooltip content="View on Explorer">
            <span>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `https://explorer.solana.com/address/${value}?cluster=${network}`,
                    "_blank",
                  )
                }
                className="p-0.5 rounded text-(--text-muted) hover:text-(--text-main) transition-colors"
              >
                <ExternalLink size={12} animateOnHover />
              </button>
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function InfoContent({ treasury }: { treasury: TreasuryEntry }) {
  const settings = useAppSettings();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const pda = treasury.publicKey.toBase58();
  const aiAuthority = treasury.account.aiAuthority?.toString?.() ?? null;
  const spentToday =
    Number(treasury.account.policyState.spentTodayUsd.toString()) / 100;
  const dailyLimit =
    Number(treasury.account.policyConfig.dailyLimitUsd.toString()) / 100;
  const totalTx = Number(treasury.account.totalTransactions.toString());
  const hasGuardrails = !!treasury.account.confidentialGuardrails;
  const guardrailMode = hasGuardrails ? "Scalar" : null;
  const spendPct = dailyLimit > 0 ? (spentToday / dailyLimit) * 100 : 0;
  const isPaused = treasury.account.executionPaused;

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm">
        <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-wider block mb-3">
          Identity
        </span>
        <div className="space-y-1">
          <div className="py-2 border-b border-border">
            <span className="mono text-[9px] uppercase text-(--text-muted) tracking-wider block mb-1">
              Agent ID
            </span>
            <span className="text-sm font-semibold text-(--text-main)">
              {treasury.account.agentId}
            </span>
          </div>
          <AddressField
            label="Treasury Address (PDA)"
            value={pda}
            fieldKey="pda"
            copiedField={copiedField}
            onCopy={copy}
            network={settings.network}
          />
          {aiAuthority && (
            <AddressField
              label="AI Authority (Agent Signer)"
              value={aiAuthority}
              fieldKey="aiAuth"
              copiedField={copiedField}
              onCopy={copy}
              network={settings.network}
            />
          )}
        </div>
      </div>

      {/* Status */}
      <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm">
        <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-wider block mb-3">
          Status
        </span>
        <div className="grid grid-cols-2 gap-3">
          {/* Execution status */}
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1.5">
              Execution
            </span>
            <Tooltip
              content={
                isPaused
                  ? "Execution is paused — no new proposals will be processed"
                  : "Execution is active — proposals are being processed normally"
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    isPaused ? "bg-amber-400" : "bg-emerald-400",
                  )}
                />
                <Badge
                  variant={isPaused ? "paused" : "active"}
                  className="text-[9px] px-2 py-0.5"
                >
                  {isPaused ? "Paused" : "Active"}
                </Badge>
              </span>
            </Tooltip>
          </div>

          {/* FHE Guardrails */}
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1.5">
              FHE Guardrails
            </span>
            <Tooltip
              content={
                guardrailMode
                  ? "Confidential FHE guardrails are active — spend limits are encrypted on-chain"
                  : "No FHE guardrails configured — policy runs in plaintext mode"
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {guardrailMode ? (
                  <>
                    <KeyRound
                      size={12}
                      animateOnHover
                      className="text-emerald-400 shrink-0"
                    />
                    <Badge variant="active" className="text-[9px] px-2 py-0.5">
                      {guardrailMode}
                    </Badge>
                  </>
                ) : (
                  <>
                    <Lock
                      size={12}
                      animateOnHover
                      className="text-(--text-muted) shrink-0"
                    />
                    <Badge variant="default" className="text-[9px] px-2 py-0.5">
                      Not set
                    </Badge>
                  </>
                )}
              </span>
            </Tooltip>
          </div>

          {/* Today's Spend */}
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Today's Spend
            </span>
            <span className="text-sm font-semibold text-(--text-main)">
              {formatCurrency(spentToday)}
            </span>
            <span className="mono text-[9px] text-(--text-muted) block mb-1.5">
              of {formatCurrency(dailyLimit)} limit
            </span>
            <Progress
              value={spendPct}
              max={100}
              size="extraSmall"
              showPercentage={false}
              className="space-y-0!"
            />
          </div>

          {/* Total Transactions */}
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Total Transactions
            </span>
            <span className="text-sm font-semibold text-(--text-main)">
              {totalTx}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyContent({
  policy,
}: {
  policy: TreasuryEntry["account"]["policyConfig"];
}) {
  const rows = [
    {
      label: "DAILY LIMIT",
      raw: Number(policy.dailyLimitUsd.toString()) / 100,
      isCurrency: true,
    },
    {
      label: "PER-TX LIMIT",
      raw: Number(policy.perTxLimitUsd.toString()) / 100,
      isCurrency: true,
    },
    {
      label: "DAYTIME HOURLY",
      raw: Number(policy.daytimeHourlyLimitUsd.toString()) / 100,
      isCurrency: true,
    },
    {
      label: "NIGHTTIME HOURLY",
      raw: Number(policy.nighttimeHourlyLimitUsd.toString()) / 100,
      isCurrency: true,
    },
    {
      label: "VELOCITY LIMIT",
      raw: Number(policy.velocityLimitUsd.toString()) / 100,
      isCurrency: true,
    },
    {
      label: "MAX SLIPPAGE",
      value: `${policy.maxSlippageBps} bps`,
      isCurrency: false,
    },
    {
      label: "MAX QUOTE AGE",
      value: policy.maxQuoteAgeSecs
        ? `${policy.maxQuoteAgeSecs.toString()}s`
        : null,
      isCurrency: false,
    },
    {
      label: "MAX RISK SCORE",
      value: `${policy.maxCounterpartyRiskScore}`,
      isCurrency: false,
    },
    {
      label: "SHARED POOL",
      raw: policy.sharedPoolLimitUsd
        ? Number(policy.sharedPoolLimitUsd.toString()) / 100
        : null,
      isCurrency: true,
    },
  ];

  return (
    <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm space-y-0">
      {rows.map((item) => {
        const displayValue =
          "raw" in item
            ? item.raw != null
              ? item.isCurrency
                ? formatCurrency(item.raw)
                : String(item.raw)
              : null
            : (item.value ?? null);
        const isNA = displayValue == null;
        const tooltip = POLICY_TOOLTIPS[item.label];

        return (
          <div
            key={item.label}
            className="flex justify-between items-center py-2.5 border-b border-border last:border-b-0"
          >
            <Tooltip content={tooltip}>
              <span className="font-mono text-[11px] uppercase tracking-wider text-(--text-muted) cursor-help">
                {item.label}
              </span>
            </Tooltip>
            <span
              className={cn(
                "font-mono text-[12px] tabular-nums",
                isNA ? "text-(--text-muted)" : "text-(--text-main)",
              )}
            >
              {isNA ? "N/A" : displayValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GovernanceContent({
  multisig,
  swarm,
}: {
  multisig: TreasuryEntry["account"]["multisig"];
  swarm: TreasuryEntry["account"]["swarm"];
}) {
  const [copiedGuardian, setCopiedGuardian] = useState<string | null>(null);
  const hasMultisig = multisig && multisig.guardians.length > 0;
  const hasSwarm = swarm && swarm.memberAgents.length > 0;

  const copyGuardian = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
    setCopiedGuardian(addr);
    setTimeout(() => setCopiedGuardian(null), 2000);
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 mb-6">
        {/* Emergency Multisig */}
        <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
            Emergency Multisig
          </span>
          {hasMultisig ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck
                  size={16}
                  animateOnHover
                  className="text-(--success-text)"
                />
                <span className="text-sm font-semibold text-(--text-main)">
                  {multisig.requiredSignatures}-of-{multisig.guardians.length}{" "}
                  Active
                </span>
              </div>
              <div className="space-y-2">
                {multisig.guardians.map((guardian: PublicKey, idx: number) => {
                  const addr = guardian.toBase58();
                  const isCopied = copiedGuardian === addr;
                  return (
                    <div
                      key={addr}
                      className="flex items-center gap-2 text-[11px] text-(--text-muted)"
                    >
                      <span className="font-mono shrink-0">
                        Guardian {idx + 1}:
                      </span>
                      <Tooltip content={addr}>
                        <span className="font-mono cursor-default">
                          {shortenAddress(addr, 6, 4)}
                        </span>
                      </Tooltip>
                      <Tooltip content={isCopied ? "Copied!" : "Copy"}>
                        <span>
                          <button
                            type="button"
                            onClick={() => copyGuardian(addr)}
                            className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                          >
                            {isCopied ? (
                              <Check
                                size={11}
                                animateOnHover
                                className="text-active"
                              />
                            ) : (
                              <Copy size={11} animateOnHover />
                            )}
                          </button>
                        </span>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Ban size={16} animateOnHover className="text-(--text-muted)" />
              <span className="text-sm text-(--text-muted)">
                Not Configured
              </span>
            </div>
          )}
        </div>

        {/* Agent Swarm */}
        <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
            Agent Swarm
          </span>
          {hasSwarm ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck
                  size={16}
                  animateOnHover
                  className="text-(--success-text)"
                />
                <span className="text-sm font-semibold text-(--text-main)">
                  {swarm.memberAgents.length} Members
                </span>
              </div>
              <p className="text-[11px] text-(--text-muted)">
                Shared pool limit:{" "}
                {formatCurrency(
                  Number(swarm.sharedPoolLimitUsd.toString()) / 100,
                )}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Ban size={16} animateOnHover className="text-(--text-muted)" />
                <span className="text-sm text-(--text-muted)">
                  Not Configured
                </span>
              </div>
              <p className="text-[11px] text-(--text-muted)">
                Enable swarm mode to allow multiple agents to share this
                treasury's spending pool.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Governance Override info banner */}
      <Tooltip content="Emergency multisig guardians can override policy decisions and cancel pending proposals in break-glass scenarios, bypassing normal agent authority.">
        <div className="p-4 bg-(--info-bg) border border-(--info-border) rounded-sm cursor-help">
          <div className="flex items-start gap-3">
            <Shield
              size={16}
              animateOnHover
              className="text-(--info-text) mt-0.5 shrink-0"
            />
            <div>
              <h4 className="text-sm font-semibold text-(--text-main) mb-1">
                Governance Override
              </h4>
              <p className="text-[11px] text-(--text-muted)">
                Emergency multisig can override policy decisions and cancel
                pending proposals in break-glass scenarios.
              </p>
            </div>
          </div>
        </div>
      </Tooltip>
    </div>
  );
}

const chainIconMap: Record<string, string> = {
  Bitcoin: "/assets/bitcoin.svg",
  Ethereum: "/assets/ethereum.svg",
  Solana: "/assets/solana.svg",
  Polygon: "/assets/polygon.svg",
  Arbitrum: "/assets/arbitrum.svg",
  Optimism: "/assets/optimism.svg",
};

function InfoRow({
  label,
  value,
  copyKey,
  explorerUrl,
  copiedId,
  onCopy,
}: {
  label: string;
  value: string | null | undefined;
  copyKey: string;
  explorerUrl?: string;
  copiedId: string | null;
  onCopy: (value: string, key: string) => void;
}) {
  if (!value) return null;
  const isCopied = copiedId === copyKey;
  const isLong = value.length > 20;
  const displayValue = isLong ? shortenAddress(value, 8, 6) : value;

  return (
    <div className="p-2 bg-(--card-bg) rounded-sm border border-border">
      <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-0.5">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Tooltip content={isLong ? value : undefined}>
          <span className="font-mono text-[11px] text-(--text-main) break-all flex-1 cursor-default">
            {displayValue}
          </span>
        </Tooltip>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip content={isCopied ? "Copied!" : "Copy"}>
            <span>
              <button
                type="button"
                onClick={() => onCopy(value, copyKey)}
                className="text-(--text-muted) hover:text-(--text-main) transition-colors"
              >
                {isCopied ? (
                  <Check size={11} animateOnHover className="text-active" />
                ) : (
                  <Copy size={11} animateOnHover />
                )}
              </button>
            </span>
          </Tooltip>
          {explorerUrl && (
            <Tooltip content="View on Explorer">
              <span>
                <button
                  type="button"
                  onClick={() => window.open(explorerUrl, "_blank")}
                  className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  <ExternalLink size={11} animateOnHover />
                </button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

function DWalletCard({
  dw,
  expandedId,
  setExpandedId,
  copiedId,
  onCopy,
  network,
}: {
  dw: {
    dwalletId: string;
    chain: number;
    address: string;
    authorizedUserPubkey?: { toString(): string } | null;
    publicKeyHex?: string | null;
    messageMetadataDigest?: string | null;
  };
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  copiedId: string | null;
  onCopy: (value: string, key: string) => void;
  network: string;
}) {
  const chain = CHAINS.find((c) => c.code === dw.chain);
  const chainName = chain?.label || "Unknown";
  const chainDescription = chainName;
  const isExpanded = expandedId === dw.dwalletId;
  const chainIcon = chainIconMap[chainName];
  const hdrKey = `hdr-${dw.dwalletId}`;
  const isHdrCopied = copiedId === hdrKey;

  let displayAddress = dw.address;
  if (dw.address && /[+/=]/.test(dw.address)) {
    try {
      const bytes = Uint8Array.from(atob(dw.address), (c) => c.charCodeAt(0));
      if (bytes.length === 32) displayAddress = bs58Encode(bytes);
    } catch {
      /* keep original */
    }
  }

  const liveBalance = useDWalletLiveBalance(displayAddress);
  const hasBalance =
    liveBalance.data &&
    (liveBalance.data.sol > 0 || liveBalance.data.tokens.length > 0);

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandedId(isExpanded ? null : dw.dwalletId)}
        onKeyDown={(e) =>
          e.key === "Enter" && setExpandedId(isExpanded ? null : dw.dwalletId)
        }
        className="w-full text-left p-4 bg-(--card-content)/60 hover:bg-(--hover-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-8 rounded-sm bg-(--card-bg) border border-border flex items-center justify-center shrink-0 p-1">
              {chainIcon ? (
                <Image
                  src={chainIcon}
                  alt={chainName}
                  width={24}
                  height={24}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs font-bold">{chainName[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Tooltip content={chainDescription}>
                  <span className="font-semibold text-sm text-(--text-main)">
                    {chainName}
                  </span>
                </Tooltip>
                <StatusPill variant="active">Active</StatusPill>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-(--text-muted) truncate">
                  {displayAddress
                    ? shortenAddress(displayAddress, 8, 6)
                    : "No address"}
                </span>
                {displayAddress && (
                  <Tooltip content={isHdrCopied ? "Copied!" : "Copy address"}>
                    <span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(displayAddress, hdrKey);
                        }}
                        className="text-(--text-muted) hover:text-(--text-main) transition-colors shrink-0"
                      >
                        {isHdrCopied ? (
                          <Check
                            size={10}
                            animateOnHover
                            className="text-active"
                          />
                        ) : (
                          <Copy size={10} animateOnHover />
                        )}
                      </button>
                    </span>
                  </Tooltip>
                )}
              </div>
              {/* Balance display */}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {liveBalance.isLoading && (
                  <span className="text-[10px] text-(--text-muted) font-mono animate-pulse">
                    fetching balance…
                  </span>
                )}
                {liveBalance.data &&
                  (hasBalance ? (
                    <>
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {liveBalance.data.sol > 0 && (
                        <span className="text-[10px] font-mono text-(--text-main) font-semibold">
                          {liveBalance.data.sol.toFixed(4)} SOL
                        </span>
                      )}
                      {liveBalance.data.tokens.map((t) => (
                        <span
                          key={t.mint}
                          className="text-[10px] font-mono text-(--text-main)"
                        >
                          {t.uiAmount}{" "}
                          <span className="text-(--text-muted)">
                            {t.symbol}
                          </span>
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-[10px] text-(--text-muted) font-mono">
                      empty
                    </span>
                  ))}
              </div>
            </div>
          </div>
          <ChevronDown
            size={14}
            animateOnHover
            className={cn(
              "shrink-0 text-(--text-muted) transition-transform duration-200",
              isExpanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 bg-(--card-bg) border-t border-border space-y-2">
          <InfoRow
            label={`${chainName} Address — send tokens here`}
            value={displayAddress}
            copyKey={`addr-${dw.dwalletId}`}
            copiedId={copiedId}
            onCopy={onCopy}
          />
          <InfoRow
            label="dWallet Account (Solana PDA)"
            value={dw.dwalletId}
            copyKey={`dwid-${dw.dwalletId}`}
            explorerUrl={`https://explorer.solana.com/address/${dw.dwalletId}?cluster=${network}`}
            copiedId={copiedId}
            onCopy={onCopy}
          />
          <InfoRow
            label="Authorized User (agent keypair)"
            value={dw.authorizedUserPubkey?.toString?.() ?? null}
            copyKey={`auth-${dw.dwalletId}`}
            copiedId={copiedId}
            onCopy={onCopy}
          />
          <InfoRow
            label="Public Key Hex (signing key)"
            value={dw.publicKeyHex ?? null}
            copyKey={`hex-${dw.dwalletId}`}
            copiedId={copiedId}
            onCopy={onCopy}
          />
          {dw.messageMetadataDigest && (
            <InfoRow
              label="Message Metadata Digest"
              value={dw.messageMetadataDigest}
              copyKey={`digest-${dw.dwalletId}`}
              copiedId={copiedId}
              onCopy={onCopy}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DWalletsContent({
  dwallets,
  copiedId,
  onCopy,
  network,
}: {
  dwallets: TreasuryEntry["account"]["dwallets"];
  copiedId: string | null;
  onCopy: (value: string, key: string) => void;
  network: string;
}) {
  const registeredDwallets = dwallets.filter((dw) => dw.dwalletId.length > 0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (registeredDwallets.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-border rounded-sm">
        <p className="text-sm text-(--text-muted)">
          No dWallets registered yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {registeredDwallets.map((dw) => (
        <DWalletCard
          key={dw.dwalletId}
          dw={dw}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          copiedId={copiedId}
          onCopy={onCopy}
          network={network}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PolicyConfigProps {
  treasury: TreasuryEntry;
}

export const PolicyConfig = ({ treasury }: PolicyConfigProps) => {
  const policy = treasury.account.policyConfig;
  const multisig = treasury.account.multisig;
  const swarm = treasury.account.swarm;
  const dwallets = treasury.account.dwallets;
  const settings = useAppSettings();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tabs = [
    {
      id: "info",
      label: "Info",
      content: <InfoContent treasury={treasury} />,
    },
    {
      id: "policy",
      label: "Policy",
      content: <PolicyContent policy={policy} />,
    },
    {
      id: "governance",
      label: "Governance",
      content: <GovernanceContent multisig={multisig} swarm={swarm} />,
    },
    {
      id: "dwallets",
      label: "dWallets",
      content: (
        <DWalletsContent
          dwallets={dwallets}
          copiedId={copiedId}
          onCopy={handleCopy}
          network={settings.network}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) mb-1">
          Configuration
        </p>
        <h2 className="text-base font-semibold text-(--text-main)">
          Treasury Config
        </h2>
      </div>
      <Tabs tabs={tabs} defaultTab="info" layoutId="configTabs" />
    </div>
  );
};
