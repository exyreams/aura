import { Settings } from "lucide-react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";
import type { RuntimeSettingRow } from "@/components/settings/types";

export function RuntimeSettingsSection({
  rows,
}: {
  rows: RuntimeSettingRow[];
}) {
  return (
    <SettingsSection
      id="runtime"
      icon={Settings}
      eyebrow="Runtime"
      title="Client runtime settings"
      description="Active client-side defaults used by dashboard providers. Editable controls can land with the wallet and agent management flows."
    >
      <SettingsRow
        label="Environment"
        description="Current client-side defaults used by dashboard providers."
      >
        <div className="overflow-hidden rounded-md border border-border">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-2 border-border border-t p-4 first:border-t-0 md:grid-cols-[180px_minmax(0,1fr)] md:items-start"
            >
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.detail}
                </p>
              </div>
              <p className="break-all font-mono text-sm text-foreground md:text-right">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
