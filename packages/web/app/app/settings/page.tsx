"use client";

import { PageHeader, Surface } from "@/components/app/ui";
import { useAppSettings } from "@/lib/hooks";

export default function SettingsPage() {
  const settings = useAppSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="App-level configuration"
        copy="These values are persisted locally and drive the wallet connection, RPC endpoint, program target, and agent preferences."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface title="Network">
          <div className="grid gap-4">
            <label>
              <span className="field-label">Environment</span>
              <select
                className="select"
                value={settings.network}
                onChange={(event) =>
                  settings.setNetwork(
                    event.target.value as "devnet" | "mainnet-beta",
                  )
                }
              >
                <option value="devnet">Devnet</option>
                <option value="mainnet-beta">Mainnet</option>
              </select>
            </label>
            <label>
              <span className="field-label">Custom RPC URL</span>
              <input
                className="input"
                value={settings.customRpcUrl}
                onChange={(event) =>
                  settings.setCustomRpcUrl(event.target.value)
                }
                placeholder="https://..."
              />
            </label>
            <label>
              <span className="field-label">Program ID Override</span>
              <input
                className="input mono"
                value={settings.programId}
                onChange={(event) => settings.setProgramId(event.target.value)}
                placeholder="Leave empty for SDK default"
              />
            </label>
          </div>
        </Surface>

        <Surface title="Agent Credentials">
          <div className="grid gap-4">
            <label>
              <span className="field-label">NIM API key</span>
              <input
                className="input"
                value={settings.nimApiKey}
                onChange={(event) => settings.setNimApiKey(event.target.value)}
                placeholder="Stored locally in browser"
              />
            </label>
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface title="Display Preferences">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Currency</span>
              <select
                className="select"
                value={settings.currency}
                onChange={(event) => settings.setCurrency(event.target.value)}
              >
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <label>
              <span className="field-label">Date format</span>
              <select
                className="select"
                value={settings.dateFormat}
                onChange={(event) => settings.setDateFormat(event.target.value)}
              >
                <option>MMM DD, YYYY HH:mm</option>
                <option>YYYY-MM-DD HH:mm</option>
              </select>
            </label>
          </div>
        </Surface>

        <Surface title="Current Summary">
          <div className="grid gap-3 text-sm">
            {[
              ["Environment", settings.network],
              ["Resolved endpoint", settings.endpoint],
              ["Program ID", settings.programId || "SDK default"],
              ["Currency", settings.currency],
              ["Date format", settings.dateFormat],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3"
              >
                <span className="text-slate-300">{label}</span>
                <span className="max-w-80 truncate text-white">{value}</span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
