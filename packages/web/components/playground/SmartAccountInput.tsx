"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Dropdown } from "@/components/global/Dropdown";
import { Input } from "@/components/global/Input";
import { ChevronLeft, Vault, Wallet } from "@/components/icons";
import { useAgents, useAppSettings, useOwnedTreasuries } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface SmartAccountInputProps {
  name: string;
  value: string;
  optional: boolean;
  onChange: (value: string) => void;
  /** The instruction this account belongs to — used to skip dropdowns for PDA-init accounts. */
  instructionName?: string;
}

// Instructions where the treasury account is a PDA being initialized (output),
// not an existing account to select (input). Leave blank — Anchor derives it.
const TREASURY_INIT_INSTRUCTIONS = new Set(["create_treasury"]);

// Account names that map to treasury PDAs
const TREASURY_ACCOUNT_NAMES = new Set([
  "treasury",
  "parent_treasury",
  "child_treasury",
  "swarm_treasury",
]);

// Account names that map to the connected wallet
const WALLET_ACCOUNT_NAMES = new Set([
  "owner",
  "payer",
  "authority",
  "caller",
  "user",
]);

// Account names that map to the AI agent signer
const AGENT_ACCOUNT_NAMES = new Set([
  "ai_authority",
  "agent",
  "signer",
  "ai_signer",
]);

const CUSTOM_VALUE = "__custom__";

export function SmartAccountInput({
  name,
  value,
  optional,
  onChange,
  instructionName,
}: SmartAccountInputProps) {
  const wallet = useWallet();
  const { agents } = useAgents();
  const settings = useAppSettings();
  const treasuriesQuery = useOwnedTreasuries();
  const [showCustom, setShowCustom] = useState(false);

  const walletAddress = wallet.publicKey?.toBase58();
  const programId =
    settings.resolvedProgramId?.toBase58() ?? settings.programId;

  // ── PDA-init accounts — derived by the program, not provided by the user ──
  if (
    TREASURY_ACCOUNT_NAMES.has(name) &&
    instructionName &&
    TREASURY_INIT_INSTRUCTIONS.has(instructionName)
  ) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border bg-(--hover-bg)">
        <span className="font-mono text-[10px] text-(--text-muted)">
          Derived from owner + agent_id
        </span>
      </div>
    );
  }

  // ── Treasury accounts ──
  if (TREASURY_ACCOUNT_NAMES.has(name)) {
    const treasuries = treasuriesQuery.data ?? [];
    const options = [
      ...treasuries.map((t) => ({
        value: t.publicKey.toBase58(),
        label:
          t.account.agentId || shortenAddress(t.publicKey.toBase58(), 6, 4),
        badge: shortenAddress(t.publicKey.toBase58(), 4, 4),
        icon: <Vault className="size-3" animateOnHover />,
      })),
      {
        value: CUSTOM_VALUE,
        label: "Enter manually…",
        icon: undefined,
        badge: undefined,
      },
    ];

    const isCustom =
      showCustom ||
      (value && !treasuries.some((t) => t.publicKey.toBase58() === value));

    if (isCustom) {
      return (
        <div className="space-y-1.5">
          <Input
            aria-label={`${name} account`}
            value={value}
            placeholder="public key"
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
          {treasuries.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              <ChevronLeft className="size-3" animateOnHover />
              Pick from treasuries
            </button>
          )}
        </div>
      );
    }

    return (
      <Dropdown
        options={options}
        value={value || undefined}
        placeholder={optional ? "optional treasury" : "select treasury"}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setShowCustom(true);
            onChange("");
          } else {
            onChange(v);
          }
        }}
      />
    );
  }

  // ── Wallet / owner accounts ──
  if (WALLET_ACCOUNT_NAMES.has(name) && walletAddress) {
    const options = [
      {
        value: walletAddress,
        label: "Connected wallet",
        badge: shortenAddress(walletAddress, 4, 4),
        icon: <Wallet className="size-3" animateOnHover />,
      },
      {
        value: CUSTOM_VALUE,
        label: "Enter manually…",
        icon: undefined,
        badge: undefined,
      },
    ];

    const isCustom = showCustom || (value && value !== walletAddress);

    if (isCustom) {
      return (
        <div className="space-y-1.5">
          <Input
            aria-label={`${name} account`}
            value={value}
            placeholder="public key"
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setShowCustom(false);
              onChange(walletAddress);
            }}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-(--text-muted) hover:text-(--text-main) transition-colors"
          >
            <ChevronLeft className="size-3" animateOnHover />
            Use connected wallet
          </button>
        </div>
      );
    }

    return (
      <Dropdown
        options={options}
        value={value || walletAddress}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setShowCustom(true);
            onChange("");
          } else {
            onChange(v);
          }
        }}
      />
    );
  }

  // ── Agent / AI authority accounts ──
  if (AGENT_ACCOUNT_NAMES.has(name) && agents.length > 0) {
    const options = [
      ...agents.map((a) => ({
        value: a.publicKey,
        label: a.label || a.agentId,
        badge: shortenAddress(a.publicKey, 4, 4),
        icon: undefined,
      })),
      {
        value: CUSTOM_VALUE,
        label: "Enter manually…",
        icon: undefined,
        badge: undefined,
      },
    ];

    const isCustom =
      showCustom || (value && !agents.some((a) => a.publicKey === value));

    if (isCustom) {
      return (
        <div className="space-y-1.5">
          <Input
            aria-label={`${name} account`}
            value={value}
            placeholder="public key"
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowCustom(false)}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-(--text-muted) hover:text-(--text-main) transition-colors"
          >
            <ChevronLeft className="size-3" animateOnHover />
            Pick from agents
          </button>
        </div>
      );
    }

    return (
      <Dropdown
        options={options}
        value={value || undefined}
        placeholder={optional ? "optional agent" : "select agent"}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setShowCustom(true);
            onChange("");
          } else {
            onChange(v);
          }
        }}
      />
    );
  }

  // ── Program ID accounts ──
  if (name === "caller_program" || name === "program") {
    return (
      <Input
        aria-label={`${name} account`}
        value={value || programId}
        placeholder="program ID"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // ── Default: plain input, with wallet quick-fill if connected ──
  return (
    <div className="relative">
      <Input
        aria-label={`${name} account`}
        value={value}
        placeholder={optional ? "optional" : "public key"}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {walletAddress && !value && (
        <button
          type="button"
          onClick={() => onChange(walletAddress)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-(--text-muted) hover:text-(--text-main) transition-colors px-1.5 py-0.5 rounded-sm border border-border hover:bg-(--hover-bg)"
        >
          wallet
        </button>
      )}
    </div>
  );
}
