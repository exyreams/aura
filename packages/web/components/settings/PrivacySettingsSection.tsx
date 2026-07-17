import { Clock, LogOut, Mail, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/global/Button";
import {
  InlineStatus,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";
import type { SessionAction } from "@/components/settings/types";
import { formatDateTime } from "@/components/settings/utils";

export function PrivacySettingsSection({
  currentEmail,
  expiresAt,
  hasRefreshToken,
  sessionAction,
  onSignOut,
}: {
  currentEmail: string | null;
  expiresAt: string | number | null | undefined;
  hasRefreshToken: boolean;
  sessionAction: SessionAction | null;
  onSignOut: (scope: SessionAction) => void;
}) {
  return (
    <SettingsSection
      id="privacy"
      icon={ShieldCheck}
      eyebrow="Privacy"
      title="Browser sessions"
      description="Control where this account stays signed in. Use global sign-out if a device or browser is no longer trusted."
    >
      <div className="grid gap-0">
        <SettingsRow
          label="Current browser"
          description="This is the session currently stored in this browser."
        >
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-3">
              <Mail
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="break-all">{currentEmail ?? "Unavailable"}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>Expires {formatDateTime(expiresAt)}</span>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <InlineStatus tone={hasRefreshToken ? "success" : "warning"}>
                {hasRefreshToken
                  ? "Persistent sign-in enabled"
                  : "Persistent sign-in unavailable"}
              </InlineStatus>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Sign out"
          description="End access for this browser, other devices, or every session."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSignOut("local")}
              loading={sessionAction === "local"}
              disabled={Boolean(sessionAction)}
              icon={<LogOut className="size-3" aria-hidden="true" />}
            >
              This browser
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSignOut("others")}
              loading={sessionAction === "others"}
              disabled={Boolean(sessionAction)}
              icon={<ShieldOff className="size-3" aria-hidden="true" />}
            >
              Other devices
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => onSignOut("global")}
              loading={sessionAction === "global"}
              disabled={Boolean(sessionAction)}
              icon={<ShieldOff className="size-3" aria-hidden="true" />}
            >
              All sessions
            </Button>
          </div>
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}
