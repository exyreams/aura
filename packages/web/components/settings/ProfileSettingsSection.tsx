import { UserRound } from "lucide-react";
import type { SyntheticEvent } from "react";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import {
  CopyButton,
  DetailRow,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";
import { formatDateTime } from "@/components/settings/utils";

type SubmitHandler = (
  event: SyntheticEvent<HTMLFormElement>,
) => void | Promise<void>;

export function ProfileSettingsSection({
  accountId,
  currentEmail,
  displayName,
  profileError,
  isSubmitting,
  createdAt,
  lastSeenAt,
  onDisplayNameChange,
  onSubmit,
}: {
  accountId: string | null | undefined;
  currentEmail: string | null;
  displayName: string;
  profileError: string | null;
  isSubmitting: boolean;
  createdAt: string | null | undefined;
  lastSeenAt: string | null | undefined;
  onDisplayNameChange: (value: string) => void;
  onSubmit: SubmitHandler;
}) {
  return (
    <SettingsSection
      id="profile"
      icon={UserRound}
      eyebrow="Profile"
      title="Account identity"
      description="Basic account details used across the dashboard and owner workflows."
    >
      <div className="grid gap-0">
        <SettingsRow
          label="Display name"
          description="Optional label used inside the dashboard."
        >
          <form
            onSubmit={onSubmit}
            className="grid max-w-md content-start gap-4"
            aria-busy={isSubmitting}
          >
            <Input
              id="display-name"
              label="Name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              maxLength={80}
              helperText="Leave blank to use the email address as the account label."
              error={profileError}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={isSubmitting}
              disabled={isSubmitting}
              icon={<UserRound className="size-3" aria-hidden="true" />}
              className="w-full sm:w-fit"
            >
              Save profile
            </Button>
          </form>
        </SettingsRow>

        <SettingsRow
          label="Account details"
          description="Stable identifiers and account timestamps."
        >
          <dl className="max-w-2xl">
            <DetailRow
              label="Account ID"
              mono
              value={
                <span className="inline-flex max-w-full items-center gap-2">
                  <span className="min-w-0 truncate">{accountId}</span>
                  <CopyButton value={accountId} label="Copy account ID" />
                </span>
              }
            />
            <DetailRow label="Email" value={currentEmail ?? "Unavailable"} />
            <DetailRow
              label="Sign-in method"
              value={currentEmail ? "Email and password" : "Unavailable"}
            />
            <DetailRow label="Created" value={formatDateTime(createdAt)} />
            <DetailRow label="Last seen" value={formatDateTime(lastSeenAt)} />
          </dl>
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}
