"use client";

import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  Tabs,
} from "@/components/global";
import { useAppSettings, useBackendInfo } from "@/lib/hooks";
import { DEFAULT_BACKEND_URL } from "@/lib/settings";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const settings = useAppSettings();
  const backendInfoQuery = useBackendInfo();
  const backendInfo = backendInfoQuery.data;

  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 1000);
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
        <Card className="space-y-6" hover={false}>
          <h2 className="text-lg font-bold text-(--text-main) mb-6">
            Network Connectivity
          </h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="environment-dropdown"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold"
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
        </Card>
      ),
    },
    {
      id: "credentials",
      label: "Credentials",
      content: (
        <Card className="space-y-6" hover={false}>
          <h2 className="text-lg font-bold text-(--text-main) mb-6">
            Backend & Agent Settings
          </h2>
          <div className="space-y-6">
            <Input
              label="Backend URL"
              value={settings.backendUrl}
              onChange={(e) => settings.setBackendUrl(e.target.value)}
              placeholder={DEFAULT_BACKEND_URL}
            />
            <div className="space-y-2">
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
        </Card>
      ),
    },
    {
      id: "display",
      label: "Display",
      content: (
        <Card className="space-y-6" hover={false}>
          <h2 className="text-lg font-bold text-(--text-main) mb-6">
            Display Preferences
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label
                htmlFor="currency-dropdown"
                className="mono text-[10px] uppercase text-(--text-muted) font-bold"
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
                className="mono text-[10px] uppercase text-(--text-muted) font-bold"
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
        </Card>
      ),
    },
  ];

  return (
    <div className="space-y-12 pb-20">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <p className="eyebrow">SETTINGS</p>
          <h1 className="text-4xl font-semibold tracking-tight text-(--text-main)">
            App-level configuration
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-(--text-muted)">
            These values are persisted locally and drive the wallet connection,
            RPC endpoint, program target, backend service, and agent
            preferences.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2">
          <Tabs tabs={settingsTabs} layoutId="settingsTabs" />
        </div>

        <div className="lg:col-span-1">
          <Card hover={false}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-bold text-(--text-main)">
                  Current Summary
                </h2>
                <p className="text-xs text-(--text-muted) mt-1">
                  Live configuration state
                </p>
              </div>
              <Badge variant="active" className="gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_var(--success)]" />
                Synced
              </Badge>
            </div>
            <div className="space-y-2">
              {[
                { label: "Environment", value: settings.network },
                {
                  label: "Resolved endpoint",
                  value:
                    settings.endpoint.length > 30
                      ? `${settings.endpoint.slice(0, 30)}...`
                      : settings.endpoint,
                  mono: true,
                },
                {
                  label: "Program ID",
                  value: settings.programId || "SDK default",
                  muted: !settings.programId,
                },
                {
                  label: "Backend URL",
                  value: settings.backendUrl,
                  mono: true,
                },
                {
                  label: "Backend auth",
                  value: backendInfo?.auth?.mode ?? "SIWS cookie",
                  muted: false,
                },
                {
                  label: "Session cookie",
                  value:
                    backendInfo?.auth?.cookieName ??
                    (backendInfoQuery.isError ? "Unavailable" : "Loading..."),
                  warning: backendInfoQuery.isError,
                  mono: !!backendInfo?.auth?.cookieName,
                },
                {
                  label: "Selected agent",
                  value: settings.selectedAgentId || "Not selected",
                  muted: !settings.selectedAgentId,
                },
                { label: "Currency", value: settings.currency },
                { label: "Date format", value: settings.dateFormat },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex justify-between items-center p-3 bg-(--card-bg) border border-border rounded-sm hover:border-primary transition-colors"
                >
                  <span className="mono text-[10px] uppercase text-(--text-muted)">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      item.mono && "mono",
                      item.muted ? "text-(--text-muted)" : "text-(--text-main)",
                      item.warning && "text-warning",
                    )}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-6 border-t border-border">
        <Button
          variant="secondary"
          className="w-full md:w-auto font-mono! text-[10px]! uppercase! tracking-widest!"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={handleReset}
        >
          Reset to Defaults
        </Button>
        <Button
          variant="primary"
          className="w-full md:w-auto px-12 font-mono! text-[10px]! uppercase! tracking-widest!"
          onClick={handleSave}
          loading={isSaving}
          icon={!isSaving && <Save className="w-4 h-4" />}
        >
          Save Changes
        </Button>
      </div>

      {/* Toast Notification */}
      <div
        className={cn(
          "fixed bottom-8 right-8 bg-success text-(--bg) px-6 py-4 rounded-md shadow-2xl flex items-center gap-3 transition-all duration-500 z-100",
          showToast
            ? "translate-y-0 opacity-100"
            : "translate-y-20 opacity-0 pointer-events-none",
        )}
      >
        <CheckCircle2 className="w-5 h-5" />
        <span className="mono text-xs font-bold uppercase tracking-wider">
          Settings successfully updated
        </span>
      </div>
    </div>
  );
}
