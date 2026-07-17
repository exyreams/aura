import { KeyRound, Mail } from "lucide-react";
import type { SyntheticEvent } from "react";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import {
  Notice,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";

type SubmitHandler = (
  event: SyntheticEvent<HTMLFormElement>,
) => void | Promise<void>;

export function SecuritySettingsSection({
  currentEmail,
  nextEmail,
  emailError,
  currentPassword,
  nextPassword,
  confirmPassword,
  passwordError,
  isSubmitting,
  onNextEmailChange,
  onCurrentPasswordChange,
  onNextPasswordChange,
  onConfirmPasswordChange,
  onEmailSubmit,
  onPasswordSubmit,
}: {
  currentEmail: string | null;
  nextEmail: string;
  emailError: string | null;
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
  passwordError: string | null;
  isSubmitting: boolean;
  onNextEmailChange: (value: string) => void;
  onCurrentPasswordChange: (value: string) => void;
  onNextPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onEmailSubmit: SubmitHandler;
  onPasswordSubmit: SubmitHandler;
}) {
  return (
    <SettingsSection
      id="security"
      icon={KeyRound}
      eyebrow="Security"
      title="Email and password"
      description="Update sign-in credentials without leaving the account settings flow."
    >
      <div className="grid gap-0">
        <SettingsRow
          label="Email address"
          description="Used for sign-in, password recovery, and account notices."
        >
          <div className="mb-4 break-all text-sm font-medium">
            {currentEmail ?? "Unavailable"}
          </div>
          <form
            onSubmit={onEmailSubmit}
            className="grid max-w-md gap-3"
            aria-busy={isSubmitting}
          >
            <Input
              id="new-email"
              label="New email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={nextEmail}
              onChange={(event) => onNextEmailChange(event.target.value)}
              placeholder="you@example.com"
              error={emailError}
              required
            />
            <Button
              type="submit"
              variant="secondary"
              loading={isSubmitting}
              disabled={isSubmitting}
              icon={<Mail className="size-3" aria-hidden="true" />}
            >
              Request email change
            </Button>
          </form>
        </SettingsRow>

        <SettingsRow
          label="Password"
          description="Re-enter the current password before setting a new one."
        >
          <form
            onSubmit={onPasswordSubmit}
            className="grid max-w-md gap-3"
            aria-busy={isSubmitting}
          >
            {passwordError ? (
              <Notice tone="danger">{passwordError}</Notice>
            ) : null}
            <Input
              id="current-password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => onCurrentPasswordChange(event.target.value)}
              required
            />
            <Input
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => onNextPasswordChange(event.target.value)}
              helperText="Use at least 8 characters."
              required
            />
            <Input
              id="confirm-password"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              required
            />
            <Button
              type="submit"
              variant="secondary"
              loading={isSubmitting}
              disabled={isSubmitting}
              icon={<KeyRound className="size-3" aria-hidden="true" />}
            >
              Change password
            </Button>
          </form>
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}
