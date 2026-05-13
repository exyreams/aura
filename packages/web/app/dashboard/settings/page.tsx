"use client";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { useState } from "react";
import { Badge, Button, Dropdown, Input, Tabs } from "@/components/global";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Checkcircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Settings,
} from "@/components/icons";
import { useAppSettings, useBackendInfo } from "@/lib/hooks";
import { DEFAULT_BACKEND_URL } from "@/lib/settings";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const settings = useAppSettings();
  const backendInfoQuery = useBackendInfo();
  const backendInfo = backendInfoQuery.data;

  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyValue = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 800);
  };

  const handleReset = () => {
    settings.setNetwork("devnet");
    settings.setCustomRpcUrl("");
    settings.setProgramId(AURA_PROGRAM_ID.toBase58());
    settings.setBackendUrl(DEFAULT_BACKEND_URL);
    settings.setSelectedAgentId("");
    settings.setNimApiKey("");
    settings.setCurrency("USD");
    settings.setDateFormat("MMM DD, YYYY HH:mm");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const settingsTabs = [
    {
      id: "network",
      label: "Network",
      content: (
        <div className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="environment-dropdown"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
            >
              Environment
            </label>
            <Dropdown
              options={[
                { value: "mainnet-beta", label: "Mainnet-Beta" },
                { value: "devnet", label: "Devnet" },
              ]}
              value={settings.network}
              onChange={(value) =>
                settings.setNetwork(value as "devnet" | "mainnet-beta")
              }
            />
          </div>
          <Input
            label="Custom RPC URL"
            placeholder="https://api.mainnet-beta.solana.com"
            value={settings.customRpcUrl}
            onChange={(e) => settings.setCustomRpcUrl(e.target.value)}
          />
          <Input
            label="Program ID Override"
            placeholder={AURA_PROGRAM_ID.toBase58()}
            suffix="SDK default"
            value={settings.programId}
            onChange={(e) => settings.setProgramId(e.target.value)}
          />
        </div>
      ),
    },
    {
      id: "credentials",
      label: "Credentials",
      content: (
        <div className="space-y-5">
          <Input
            label="Backend URL"
            value={settings.backendUrl}
            onChange={(e) => settings.setBackendUrl(e.target.value)}
            placeholder={DEFAULT_BACKEND_URL}
          />
          <div className="space-y-1.5">
            <Input
              label="Model API Key"
              type="password"
              placeholder="sk-................................"
              value={settings.nimApiKey}
              onChange={(e) => settings.setNimApiKey(e.target.value)}
            />
            <p className="text-[10px] text-(--text-muted) mono">
              Stored locally in browser for the agent backend
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "display",
      label: "Display",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label
              htmlFor="currency-dropdown"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
            >
              Currency
            </label>
            <Dropdown
              options={[
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
              ]}
              value={settings.currency}
              onChange={(value) => settings.setCurrency(value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="date-format-dropdown"
              className="mono text-[10px] uppercase text-(--text-muted) font-bold block"
            >
              Date format
            </label>
            <Dropdown
              options={[
                { value: "MMM DD, YYYY HH:mm", label: "MMM DD, YYYY HH:mm" },
                { value: "YYYY-MM-DD HH:mm", label: "YYYY-MM-DD HH:mm" },
              ]}
              value={settings.dateFormat}
              onChange={(value) => settings.setDateFormat(value)}
            />
          </div>
        </div>
      ),
    },
  ];

  // Summary rows — only what's useful to see at a glance
  const summaryRows: Array<{
    label: string;
    value: string;
    mono?: boolean;
    muted?: boolean;
    warning?: boolean;
    success?: boolean;
    copyValue?: string;
    explorerUrl?: string;
  }> = [
    { label: "Environment", value: settings.network },
    {
      label: "RPC endpoint",
      value: settings.customRpcUrl
        ? settings.customRpcUrl.replace(/^https?:\/\//, "").slice(0, 28) +
          (settings.customRpcUrl.length > 36 ? "…" : "")
        : "Default",
      mono: true,
      muted: !settings.customRpcUrl,
      copyValue: settings.customRpcUrl || undefined,
    },
    {
      label: "Program ID",
      value: settings.programId
        ? `${settings.programId.slice(0, 8)}…${settings.programId.slice(-4)}`
        : "SDK default",
      mono: true,
      muted: !settings.programId,
      copyValue: settings.programId || undefined,
      explorerUrl: settings.programId
        ? `https://explorer.solana.com/address/${settings.programId}?cluster=${settings.network}`
        : undefined,
    },
    {
      label: "Backend",
      value: backendInfoQuery.isError
        ? "Unreachable"
        : backendInfo
          ? "Connected"
          : "Connecting…",
      warning: backendInfoQuery.isError,
      success: !!backendInfo && !backendInfoQuery.isError,
    },
    {
      label: "Selected agent",
      value: settings.selectedAgentId || "None",
      muted: !settings.selectedAgentId,
      copyValue: settings.selectedAgentId || undefined,
    },
    { label: "Currency", value: settings.currency },
  ];

  return (
    <div className="relative max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Configuration
          </span>
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-(--text-main) mb-1.5">
            Settings
          </h1>
          <p className="text-(--text-muted) font-light text-sm">
            Network, credentials, and display preferences. Persisted locally in
            the browser.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="medium"
            icon={<RefreshCw className="size-3.5" animateOnHover />}
            onClick={handleReset}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            size="medium"
            icon={
              !isSaving ? (
                <Settings className="size-3.5" animateOnHover />
              ) : undefined
            }
            onClick={handleSave}
            loading={isSaving}
          >
            Save
          </Button>
        </div>
      </header>

      {/* 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-8 items-start">
        {/* Left: tabs */}
        <Tabs tabs={settingsTabs} layoutId="settingsTabs" />

        {/* Right: compact summary */}
        <div className="rounded-sm border border-border bg-(--card-bg) overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-(--text-main)">
              Current State
            </h2>
            <Badge variant="active" className="gap-1.5 text-[9px]">
              <div className="size-1.5 rounded-full bg-success animate-pulse" />
              Live
            </Badge>
          </div>
          <div className="divide-y divide-border">
            {summaryRows.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between px-5 py-3"
              >
                <span className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  {item.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs",
                      item.mono && "font-mono",
                      item.muted
                        ? "text-(--text-muted)"
                        : item.warning
                          ? "text-warning"
                          : item.success
                            ? "text-success"
                            : "text-(--text-main)",
                    )}
                  >
                    {item.value}
                  </span>
                  {item.copyValue && (
                    <Tooltip
                      content={copiedKey === item.label ? "Copied!" : "Copy"}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const val = item.copyValue;
                          if (val) void copyValue(val, item.label);
                        }}
                        className="inline-flex size-5 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-main)"
                      >
                        <Copy className="size-3" animateOnHover />
                      </button>
                    </Tooltip>
                  )}
                  {item.explorerUrl && (
                    <Tooltip content="View on Explorer">
                      <a
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-5 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-main)"
                      >
                        <ExternalLink className="size-3" animateOnHover />
                      </a>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      <div
        className={cn(
          "fixed bottom-8 right-8 bg-success text-(--bg) px-5 py-3 rounded-sm shadow-2xl flex items-center gap-2.5 transition-all duration-500 z-100",
          showToast
            ? "translate-y-0 opacity-100"
            : "translate-y-20 opacity-0 pointer-events-none",
        )}
      >
        <Checkcircle className="size-4" animateOnHover />
        <span className="mono text-xs font-bold uppercase tracking-wider">
          Settings saved
        </span>
      </div>
    </div>
  );
}
