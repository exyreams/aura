"use client";

import type { PublicKey } from "@solana/web3.js";
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Shield,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Tabs } from "@/components/global/Tabs";
import { Tooltip } from "@/components/global/Tooltip";
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
          <Tooltip content={copiedField === fieldKey ? "Copied!" : "Copy"}>
            <button
              type="button"
              onClick={() => onCopy(value, fieldKey)}
              className="p-0.5 rounded text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              {copiedField === fieldKey ? (
                <Check className="size-3 text-active" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </Tooltip>
          <Tooltip content="View on Solana Explorer">
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
              <ExternalLink className="size-3" />
            </button>
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

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="p-4 bg-(--card-content) border border-border rounded-sm">
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
      <div className="p-4 bg-(--card-content) border border-border rounded-sm">
        <span className="mono text-[10px] uppercase text-(--text-muted) font-bold tracking-wider block mb-3">
          Status
        </span>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1.5">
              Execution
            </span>
            <Badge
              variant={treasury.account.executionPaused ? "paused" : "active"}
              className="text-[9px] px-2 py-0.5"
            >
              {treasury.account.executionPaused ? "Paused" : "Active"}
            </Badge>
          </div>
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1.5">
              FHE Guardrails
            </span>
            {guardrailMode ? (
              <Badge variant="active" className="text-[9px] px-2 py-0.5">
                {guardrailMode}
              </Badge>
            ) : (
              <Badge variant="default" className="text-[9px] px-2 py-0.5">
                Not set
              </Badge>
            )}
          </div>
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Today's Spend
            </span>
            <span className="text-sm font-semibold text-(--text-main)">
              {formatCurrency(spentToday)}
            </span>
            <span className="mono text-[9px] text-(--text-muted) block">
              of {formatCurrency(dailyLimit)} limit
            </span>
          </div>
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
  return (
    <div className="space-y-2">
      {[
        {
          label: "DAILY LIMIT",
          value: formatCurrency(Number(policy.dailyLimitUsd.toString()) / 100),
          variant: "default" as const,
        },
        {
          label: "PER-TX LIMIT",
          value: formatCurrency(Number(policy.perTxLimitUsd.toString()) / 100),
          variant: "default" as const,
        },
        {
          label: "DAYTIME HOURLY",
          value: formatCurrency(
            Number(policy.daytimeHourlyLimitUsd.toString()) / 100,
          ),
          variant: "default" as const,
        },
        {
          label: "NIGHTTIME HOURLY",
          value: formatCurrency(
            Number(policy.nighttimeHourlyLimitUsd.toString()) / 100,
          ),
          variant: "default" as const,
        },
        {
          label: "VELOCITY LIMIT",
          value: formatCurrency(
            Number(policy.velocityLimitUsd.toString()) / 100,
          ),
          variant: "default" as const,
        },
        {
          label: "MAX SLIPPAGE",
          value: `${policy.maxSlippageBps} bps`,
          variant: "default" as const,
        },
        {
          label: "MAX QUOTE AGE",
          value: policy.maxQuoteAgeSecs
            ? `${policy.maxQuoteAgeSecs.toString()}s`
            : "N/A",
          variant: "default" as const,
        },
        {
          label: "MAX RISK SCORE",
          value: `${policy.maxCounterpartyRiskScore}`,
          variant: "default" as const,
        },
        {
          label: "SHARED POOL",
          value: policy.sharedPoolLimitUsd
            ? formatCurrency(Number(policy.sharedPoolLimitUsd.toString()) / 100)
            : "N/A",
          variant: "default" as const,
        },
      ].map((item) => (
        <div
          key={item.label}
          className="flex justify-between items-center py-2 border-b border-border last:border-b-0"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-(--text-muted)">
            {item.label}
          </span>
          <Badge variant={item.variant}>{item.value}</Badge>
        </div>
      ))}
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
  const hasMultisig = multisig && multisig.guardians.length > 0;
  const hasSwarm = swarm && swarm.memberAgents.length > 0;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="p-4 bg-(--card-content) border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
            Emergency Multisig
          </span>
          {hasMultisig ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-(--success-text)" />
                <span className="text-sm font-semibold text-(--text-main)">
                  {multisig.requiredSignatures}-of-{multisig.guardians.length}{" "}
                  Active
                </span>
              </div>
              <div className="space-y-2">
                {multisig.guardians.map((guardian: PublicKey, idx: number) => (
                  <div
                    key={guardian.toBase58()}
                    className="text-[11px] text-(--text-muted)"
                  >
                    <span className="font-mono">Guardian {idx + 1}:</span>{" "}
                    {shortenAddress(guardian.toBase58(), 4, 4)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Ban size={16} className="text-(--text-muted)" />
              <span className="text-sm text-(--text-muted)">
                Not Configured
              </span>
            </div>
          )}
        </div>
        <div className="p-4 bg-(--card-content) border border-border rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) block mb-3">
            Agent Swarm
          </span>
          {hasSwarm ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={16} className="text-(--success-text)" />
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
                <Ban size={16} className="text-(--text-muted)" />
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

      <div className="p-4 bg-(--info-bg) border border-(--info-border) rounded-sm">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-(--info-text) mt-0.5 shrink-0" />
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
  return (
    <div className="p-2 bg-(--card-bg) rounded-sm border border-border">
      <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-0.5">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-(--text-main) break-all flex-1">
          {value}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onCopy(value, copyKey)}
            className="text-(--text-muted) hover:text-(--text-main) transition-colors"
          >
            <Copy size={11} />
          </button>
          {explorerUrl && (
            <button
              type="button"
              onClick={() => window.open(explorerUrl, "_blank")}
              className="text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              <ExternalLink size={11} />
            </button>
          )}
          {copiedId === copyKey && (
            <span className="text-[10px] text-(--success-text) font-mono">
              copied
            </span>
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
  const isExpanded = expandedId === dw.dwalletId;
  const chainIcon = chainIconMap[chainName];

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

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandedId(isExpanded ? null : dw.dwalletId)}
        className="w-full text-left p-4 bg-(--card-content) hover:bg-(--hover-bg) transition-colors cursor-pointer"
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
                <span className="font-semibold text-sm text-(--text-main)">
                  {chainName}
                </span>
                <StatusPill variant="active">Active</StatusPill>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-(--text-muted) truncate">
                  {displayAddress
                    ? shortenAddress(displayAddress, 8, 6)
                    : "No address"}
                </span>
                {displayAddress && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(displayAddress, `hdr-${dw.dwalletId}`);
                    }}
                    className="text-(--text-muted) hover:text-(--text-main) transition-colors shrink-0"
                  >
                    <Copy size={10} />
                  </button>
                )}
                {copiedId === `hdr-${dw.dwalletId}` && (
                  <span className="text-[10px] text-(--success-text) font-mono">
                    copied
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {liveBalance.isLoading && (
                  <span className="text-[10px] text-(--text-muted) font-mono animate-pulse">
                    fetching balance…
                  </span>
                )}
                {liveBalance.data && (
                  <>
                    {liveBalance.data.sol > 0 && (
                      <span className="text-[10px] font-mono text-(--text-main)">
                        {liveBalance.data.sol.toFixed(4)} SOL
                      </span>
                    )}
                    {liveBalance.data.tokens.map((t) => (
                      <span
                        key={t.mint}
                        className="text-[10px] font-mono text-(--text-main)"
                      >
                        {t.uiAmount}{" "}
                        <span className="text-(--text-muted)">{t.symbol}</span>
                      </span>
                    ))}
                    {liveBalance.data.sol === 0 &&
                      liveBalance.data.tokens.length === 0 && (
                        <span className="text-[10px] text-(--text-muted) font-mono">
                          empty
                        </span>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>
          <ChevronDown
            size={14}
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
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Config
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Policy limits, governance settings, and registered dWallets.
        </p>
      </div>
      <Tabs tabs={tabs} defaultTab="info" layoutId="configTabs" />
    </div>
  );
};
