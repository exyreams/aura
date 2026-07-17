"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import type { ReactNode, SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { DashboardContent } from "@/components/dashboard/DashboardPrimitives";
import { StatusBadge } from "@/components/global/StatusBadge";
import { ConduitSessionsSection } from "@/components/settings/ConduitSessionsSection";
import { PrivacySettingsSection } from "@/components/settings/PrivacySettingsSection";
import { ProfileSettingsSection } from "@/components/settings/ProfileSettingsSection";
import { RuntimeSettingsSection } from "@/components/settings/RuntimeSettingsSection";
import { SecuritySettingsSection } from "@/components/settings/SecuritySettingsSection";
import { Notice, SettingsNav } from "@/components/settings/SettingsPrimitives";
import type {
  NoticeTone,
  RuntimeSettingRow,
  SessionAction,
  SettingsSectionId,
} from "@/components/settings/types";
import { getErrorMessage } from "@/components/settings/utils";
import { WalletSettingsSection } from "@/components/settings/WalletSettingsSection";
import type { AgentKeypair } from "@/lib/hooks";
import { useAgents, useAppSettings } from "@/lib/hooks";

export default function SettingsPage() {
  const settings = useAppSettings();
  const auth = useOwnerAuth();
  const wallet = useWallet();
  const {
    agents,
    isLoading: agentsLoading,
    error: agentsError,
    deleteAgent,
    deleteAgentMutation,
    refetch: refetchAgents,
  } = useAgents();
  const [displayNameEdit, setDisplayNameEdit] = useState<string | null>(null);
  const [nextEmail, setNextEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<{
    tone: NoticeTone;
    message: string;
  } | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [sessionAction, setSessionAction] = useState<SessionAction | null>(
    null,
  );
  const [revokingAgentId, setRevokingAgentId] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("profile");

  const hasConnectedWallet = wallet.connected && Boolean(wallet.publicKey);
  const currentEmail = auth.user?.email ?? auth.profile?.email ?? null;
  const profileDisplayName = auth.profile?.display_name ?? "";
  const displayName = displayNameEdit ?? profileDisplayName;
  const visibleAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const leftActive = left.status === "active" ? 0 : 1;
        const rightActive = right.status === "active" ? 0 : 1;
        if (leftActive !== rightActive) {
          return leftActive - rightActive;
        }
        return right.createdAt - left.createdAt;
      }),
    [agents],
  );
  const runtimeRows = useMemo<RuntimeSettingRow[]>(
    () => [
      {
        label: "Network",
        value: settings.network,
        detail: "ConnectionProvider cluster selection.",
      },
      {
        label: "RPC endpoint",
        value: settings.endpoint,
        detail: settings.customRpcUrl ? "Custom RPC URL" : "Solana cluster URL",
      },
      {
        label: "AURA program",
        value: settings.programId,
        detail: settings.resolvedProgramId
          ? "Valid public key"
          : "Invalid value",
      },
      {
        label: "Currency",
        value: settings.currency,
        detail: "Display preference for future fiat views.",
      },
      {
        label: "Date format",
        value: settings.dateFormat,
        detail: "Display preference for dashboard timestamps.",
      },
    ],
    [
      settings.currency,
      settings.customRpcUrl,
      settings.dateFormat,
      settings.endpoint,
      settings.network,
      settings.programId,
      settings.resolvedProgramId,
    ],
  );

  const setSuccess = (message: string) => {
    setNotice({ tone: "success", message });
  };

  const setFailure = (message: string) => {
    setNotice({ tone: "danger", message });
  };

  const handleProfileSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setProfileError(null);
    setNotice(null);

    try {
      const result = await auth.updateProfile({ displayName });
      setSuccess(result.message);
      setDisplayNameEdit(null);
    } catch (cause) {
      const message = getErrorMessage(cause);
      setProfileError(message);
      setFailure(message);
    }
  };

  const handleEmailChange = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setNotice(null);

    const email = nextEmail.trim();
    if (!email) {
      setEmailError("Enter the new email address.");
      return;
    }

    try {
      const result = await auth.requestEmailChange(email);
      setSuccess(result.message);
      setNextEmail("");
    } catch (cause) {
      const message = getErrorMessage(cause);
      setEmailError(message);
      setFailure(message);
    }
  };

  const handleChangePassword = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setPasswordError(null);
    setNotice(null);

    if (nextPassword.length < 8) {
      setPasswordError("Use at least 8 characters for the new password.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    try {
      const result = await auth.changePassword(currentPassword, nextPassword);
      setSuccess(result.message);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (cause) {
      const message = getErrorMessage(cause);
      setPasswordError(message);
      setFailure(message);
    }
  };

  const runWalletAction = async (
    action: () => Promise<void>,
    message = "Wallet links updated.",
  ) => {
    setWalletError(null);
    setNotice(null);

    try {
      await action();
      setSuccess(message);
    } catch (cause) {
      const errorMessage = getErrorMessage(cause);
      setWalletError(errorMessage);
      setFailure(errorMessage);
    }
  };

  const handleSignOut = async (scope: SessionAction) => {
    setSessionAction(scope);
    setNotice(null);

    try {
      await auth.signOut(scope);
      if (scope === "others") {
        setSuccess("Other sessions were signed out.");
        return;
      }

      window.location.assign("/auth/login");
    } catch (cause) {
      setFailure(getErrorMessage(cause));
    } finally {
      setSessionAction(null);
    }
  };

  const handleRevokeAgent = async (agent: AgentKeypair) => {
    setNotice(null);
    setRevokingAgentId(agent.id);

    try {
      await deleteAgent(agent.id);
      setSuccess(`${agent.label || agent.agentId} was revoked.`);
    } catch (cause) {
      setFailure(getErrorMessage(cause));
    } finally {
      setRevokingAgentId(null);
    }
  };

  const handleRefreshAgents = () => {
    setNotice(null);
    void refetchAgents();
  };

  const activeSectionContent = {
    profile: (
      <ProfileSettingsSection
        accountId={auth.profile?.id}
        currentEmail={currentEmail}
        displayName={displayName}
        profileError={profileError}
        isSubmitting={auth.isSubmitting}
        createdAt={auth.profile?.created_at}
        lastSeenAt={auth.profile?.last_seen_at}
        onDisplayNameChange={setDisplayNameEdit}
        onSubmit={handleProfileSubmit}
      />
    ),
    security: (
      <SecuritySettingsSection
        currentEmail={currentEmail}
        nextEmail={nextEmail}
        emailError={emailError}
        currentPassword={currentPassword}
        nextPassword={nextPassword}
        confirmPassword={confirmPassword}
        passwordError={passwordError}
        isSubmitting={auth.isSubmitting}
        onNextEmailChange={setNextEmail}
        onCurrentPasswordChange={setCurrentPassword}
        onNextPasswordChange={setNextPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onEmailSubmit={handleEmailChange}
        onPasswordSubmit={handleChangePassword}
      />
    ),
    privacy: (
      <PrivacySettingsSection
        currentEmail={currentEmail}
        expiresAt={auth.session?.expires_at}
        hasRefreshToken={Boolean(auth.session?.refresh_token)}
        sessionAction={sessionAction}
        onSignOut={(scope) => void handleSignOut(scope)}
      />
    ),
    wallets: (
      <WalletSettingsSection
        wallets={auth.accountWallets}
        walletError={walletError}
        hasConnectedWallet={hasConnectedWallet}
        isLinkingWallet={auth.isLinkingWallet}
        onLinkWallet={() =>
          void runWalletAction(
            auth.linkConnectedWallet,
            "Wallet linked to this account.",
          )
        }
        onSetPrimaryWallet={(walletId) =>
          void runWalletAction(() => auth.setPrimaryWallet(walletId))
        }
        onUnlinkWallet={(walletId) =>
          void runWalletAction(() => auth.unlinkWallet(walletId))
        }
      />
    ),
    conduit: (
      <ConduitSessionsSection
        agents={visibleAgents}
        isLoading={agentsLoading}
        error={agentsError}
        isDeleting={deleteAgentMutation.isPending}
        revokingAgentId={revokingAgentId}
        onRefresh={handleRefreshAgents}
        onRevoke={(agent) => void handleRevokeAgent(agent)}
      />
    ),
    runtime: <RuntimeSettingsSection rows={runtimeRows} />,
  } satisfies Record<SettingsSectionId, ReactNode>;

  return (
    <DashboardContent className="max-w-screen-2xl">
      <header className="flex flex-col justify-between gap-4 border-border border-b pb-5 lg:flex-row lg:items-end">
        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Account
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Settings
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Manage profile, sign-in security, linked owner wallets, and Conduit
            access for this account.
          </p>
        </div>
        <StatusBadge tone={auth.primaryWallet ? "success" : "warning"}>
          {auth.primaryWallet ? "Ready" : "Owner wallet required"}
        </StatusBadge>
      </header>

      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      {auth.error && !notice ? (
        <Notice tone="danger">{auth.error}</Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
        <SettingsNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        <div>{activeSectionContent[activeSection]}</div>
      </div>
    </DashboardContent>
  );
}
