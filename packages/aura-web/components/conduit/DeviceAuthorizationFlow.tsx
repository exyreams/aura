"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Laptop,
  LockKeyhole,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { WalletAccountMenu } from "@/components/global/WalletAccountMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import { formatAddress } from "@/lib/formatting/addresses";
import { cn } from "@/lib/utils";

interface DeviceCodeDetails {
  id: string;
  userCode: string;
  status: "pending" | "approved" | "denied" | "expired" | "consumed";
  clientName: string | null;
  requestedAgentId: string | null;
  requestedAgentLabel: string | null;
  requestedScopes: string[];
  requestedTreasuryPda: string | null;
  requestedCaps: unknown;
  createdAt: string;
  expiresAt: string;
  expiresIn: number;
  approvedAt: string | null;
  deniedAt: string | null;
  consumedAt: string | null;
  approvedSessionId: string | null;
}

interface DeviceCodeResponse {
  device: DeviceCodeDetails;
}

interface ApproveDeviceResponse {
  device: DeviceCodeDetails;
  session: {
    id: string;
    agent_id: string;
    agent_label: string | null;
  };
}

interface ApprovalChallengeResponse {
  challengeId: string;
  message: string;
  expiresAt: string;
  walletAddress: string;
}

const expiryOptions = [
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "7", label: "7d" },
  { value: "never", label: "Never" },
];

function formatCodeInput(value: string) {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  if (compact.length <= 4) {
    return compact;
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function isCompleteCode(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").length === 8;
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }

  return body;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(status: DeviceCodeDetails["status"]) {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
    case "consumed":
      return "success";
    case "denied":
    case "expired":
      return "danger";
  }
}

function scopeTone(scope: string) {
  if (scope === "wallet:transfer" || scope.includes("execute")) {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  if (scope === "read" || scope.endsWith(":read")) {
    return "border-border bg-background text-muted-foreground";
  }

  return "border-primary/30 bg-primary/10 text-primary";
}

function Logo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const src =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  return (
    <Image
      src={src}
      alt="AURA"
      width={112}
      height={28}
      className="h-7 w-28"
      priority
      suppressHydrationWarning
    />
  );
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span
      title={getAgentScopeLabel(scope)}
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wide",
        scopeTone(scope),
      )}
    >
      {scope}
    </span>
  );
}

function CodeGlyph({ code }: { code: string }) {
  const characters = code
    .replace("-", "")
    .split("")
    .map((character, index) => ({
      character,
      id: `code-position-${index}`,
    }));

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <span className="sr-only">Device code {code}</span>
      {characters.map(({ character, id }) => (
        <span
          key={id}
          className="flex aspect-square min-w-10 items-center justify-center rounded-md border border-border bg-background font-mono text-lg font-semibold tabular-nums text-foreground"
        >
          {character}
        </span>
      ))}
    </div>
  );
}

function DetailLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SignInPrompt({ next }: { next: string }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-88px)] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex size-11 items-center justify-center rounded-md border border-border bg-background">
          <LockKeyhole className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          Sign in to authorize
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Conduit device approvals are tied to your AURA account and primary
          owner wallet.
        </p>
        <Link
          href={`/auth/login?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}

function InitialCodeForm({
  code,
  setCode,
  onSubmit,
}: {
  code: string;
  setCode: (code: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-md place-items-center px-4 py-10">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="w-full rounded-lg border border-border bg-surface p-6 shadow-sm"
      >
        <div className="flex size-11 items-center justify-center rounded-md border border-border bg-background">
          <KeyRound className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          Enter device code
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Paste the code printed by the Conduit CLI to continue authorization.
        </p>
        <Input
          id="conduit-standalone-device-code"
          label="Device code"
          value={code}
          placeholder="ABCD-EFGH"
          autoComplete="one-time-code"
          spellCheck={false}
          inputMode="text"
          className="mt-5 font-mono uppercase tracking-[0.24em]"
          onChange={(event) => setCode(formatCodeInput(event.target.value))}
        />
        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={!isCompleteCode(code)}
        >
          Continue
        </Button>
      </form>
    </div>
  );
}

function LoadingPrompt() {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-3xl place-items-center px-4 py-10">
      <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-5 h-10 animate-pulse rounded bg-muted" />
        <div className="mt-5 grid gap-2">
          <div className="h-12 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function TerminalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

function TerminalPreview({ device }: { device: DeviceCodeDetails }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 border-b border-border pb-3">
        <span className="size-2.5 rounded-full bg-danger/70" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-success/70" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          conduit agent login
        </span>
      </div>
      <div className="pt-2 font-mono text-xs">
        <TerminalLine
          label="client"
          value={device.clientName ?? "Conduit CLI"}
        />
        <TerminalLine
          label="agent"
          value={
            device.requestedAgentLabel ?? device.requestedAgentId ?? "generated"
          }
        />
        <TerminalLine
          label="scope"
          value={`${device.requestedScopes.length} permission${
            device.requestedScopes.length === 1 ? "" : "s"
          }`}
        />
      </div>
    </div>
  );
}

function CompletedState({
  device,
  approvedSession,
  onReset,
}: {
  device: DeviceCodeDetails;
  approvedSession: ApproveDeviceResponse["session"] | null;
  onReset: () => void;
}) {
  const success = device.status === "approved" || device.status === "consumed";

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-xl place-items-center px-4 py-10">
      <div className="w-full rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <div
          className={cn(
            "mx-auto flex size-12 items-center justify-center rounded-full border",
            success
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {success ? (
            <CheckCircle2 className="size-6" aria-hidden />
          ) : (
            <XCircle className="size-6" aria-hidden />
          )}
        </div>
        <StatusBadge className="mt-5" tone={statusTone(device.status)}>
          {device.status}
        </StatusBadge>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {approvedSession ? "Device authorized" : `Device ${device.status}`}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {success
            ? "The CLI can retrieve its one-time token handoff. You can close this window."
            : "This code can no longer be used. Start a new Conduit login from the CLI."}
        </p>
        {approvedSession ? (
          <div className="mt-5 grid gap-2 rounded-md border border-border bg-background p-3 text-left">
            <DetailLine label="Session" value={approvedSession.id} mono />
            <DetailLine label="Agent" value={approvedSession.agent_id} mono />
          </div>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={onReset}>
            Another code
          </Button>
          <Link
            href="/dashboard/conduit/sessions"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
          >
            Sessions
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ApprovalPrompt({
  code,
  device,
  onReset,
}: {
  code: string;
  device: DeviceCodeDetails;
  onReset: () => void;
}) {
  const auth = useOwnerAuth();
  const wallet = useWallet();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [treasuryPda, setTreasuryPda] = useState(
    device.requestedTreasuryPda ?? "",
  );
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [approvedSession, setApprovedSession] = useState<
    ApproveDeviceResponse["session"] | null
  >(null);
  const displayName =
    device.requestedAgentLabel ??
    device.requestedAgentId ??
    device.clientName ??
    "Conduit client";
  const primaryWalletLabel = auth.primaryWallet
    ? formatAddress(auth.primaryWallet.wallet_address)
    : "Required";
  const primaryWalletAddress = auth.primaryWallet?.wallet_address ?? null;
  const connectedWalletAddress = wallet.publicKey?.toBase58() ?? null;
  const connectedToPrimaryWallet =
    Boolean(primaryWalletAddress) &&
    connectedWalletAddress === primaryWalletAddress;
  const canSignApproval =
    connectedToPrimaryWallet && Boolean(wallet.signMessage);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!primaryWalletAddress) {
        throw new Error(
          "Set up a primary owner wallet before approving Conduit devices.",
        );
      }

      if (!connectedWalletAddress) {
        throw new Error("Connect the primary owner wallet before approving.");
      }

      if (connectedWalletAddress !== primaryWalletAddress) {
        throw new Error("Switch to the primary owner wallet before approving.");
      }

      if (!wallet.signMessage) {
        throw new Error("The connected wallet cannot sign approval messages.");
      }

      const challenge = await readJson<ApprovalChallengeResponse>(
        await fetch(
          `/api/conduit/device/${encodeURIComponent(code)}/challenge`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletAddress: connectedWalletAddress,
              treasuryPda: treasuryPda.trim() || null,
              expiresInDays,
              autoApprove: "never",
            }),
          },
        ),
      );
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signatureBytes = await wallet.signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      return readJson<ApproveDeviceResponse>(
        await fetch(`/api/conduit/device/${encodeURIComponent(code)}/approve`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            walletAddress: connectedWalletAddress,
            signature,
          }),
        }),
      );
    },
    onSuccess: async (payload) => {
      setApprovedSession(payload.session);
      toast.success("Device authorized", {
        description: "The CLI can retrieve its token on the next poll.",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conduit-device-code", code],
        }),
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
    onError: (cause) => {
      toast.danger("Could not authorize device", {
        description:
          cause instanceof Error ? cause.message : "Try again in a moment.",
      });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async () =>
      readJson<DeviceCodeResponse>(
        await fetch(`/api/conduit/device/${encodeURIComponent(code)}/deny`, {
          method: "POST",
          credentials: "same-origin",
        }),
      ),
    onSuccess: async () => {
      toast.success("Device denied");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conduit-device-code", code],
        }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
    onError: (cause) => {
      toast.danger("Could not deny device", {
        description:
          cause instanceof Error ? cause.message : "Try again in a moment.",
      });
    },
  });
  const actionError = approveMutation.error ?? denyMutation.error;

  if (device.status !== "pending" || approvedSession) {
    return (
      <CompletedState
        device={device}
        approvedSession={approvedSession}
        onReset={onReset}
      />
    );
  }

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-5xl place-items-center px-4 py-8">
      <div className="grid w-full overflow-hidden rounded-lg border border-border bg-surface shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
        <section className="border-b border-border bg-background/50 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-surface">
              <Laptop className="size-6 text-muted-foreground" aria-hidden />
            </div>
            <StatusBadge tone="warning">Pending</StatusBadge>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Authorize {displayName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A local Conduit process is requesting a scoped AURA session. Only
            approve this if you started the login command.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <CodeGlyph code={device.userCode} />
            <div className="grid gap-3">
              <TerminalPreview device={device} />
              <div className="rounded-md border border-border bg-surface p-3">
                <DetailLine
                  label="Expires"
                  value={formatDateTime(device.expiresAt)}
                />
                <DetailLine
                  label="Owner wallet"
                  value={primaryWalletLabel}
                  mono={Boolean(auth.primaryWallet)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold">Session permissions</h2>
              <p className="text-sm text-muted-foreground">
                These scopes will be attached to the token.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {device.requestedScopes.map((scope) => (
              <ScopeChip key={scope} scope={scope} />
            ))}
          </div>

          <div className="mt-6 grid gap-4">
            <Input
              id="conduit-authorization-treasury"
              label="Treasury scope"
              value={treasuryPda}
              placeholder="Optional treasury PDA"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => setTreasuryPda(event.target.value)}
              helperText="Leave empty for a session not scoped to one treasury."
            />

            <fieldset className="grid gap-2">
              <legend className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Session expiry
              </legend>
              <div className="grid grid-cols-4 gap-1.5 rounded-md border border-border bg-background p-1">
                {expiryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={expiresInDays === option.value}
                    onClick={() => setExpiresInDays(option.value)}
                    className={cn(
                      "min-h-10 rounded-sm px-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      expiresInDays === option.value
                        ? "bg-primary text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {!auth.primaryWallet ? (
            <div className="mt-5 rounded-md border border-warning/30 bg-warning/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-warning">
                    Owner wallet not set up
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Link and mark a primary owner wallet before authorizing
                    Conduit clients.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="mt-3 inline-flex min-h-10 items-center justify-center rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Open settings
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-md border border-border bg-background p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Owner wallet signature
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Approval requires the linked primary wallet.
                  </p>
                </div>
                <WalletAccountMenu
                  connectLabel="Connect wallet"
                  showAppNavigation={false}
                  connectedVariant={
                    connectedToPrimaryWallet ? "secondary" : "danger"
                  }
                />
              </div>
              {connectedWalletAddress && !connectedToPrimaryWallet ? (
                <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">
                  Connected {formatAddress(connectedWalletAddress)}. Switch to{" "}
                  {formatAddress(auth.primaryWallet.wallet_address)} to approve.
                </p>
              ) : null}
              {connectedToPrimaryWallet && !wallet.signMessage ? (
                <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm leading-6 text-danger">
                  This wallet does not support message signing.
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => denyMutation.mutate()}
              loading={denyMutation.isPending}
              disabled={approveMutation.isPending}
              icon={<X className="size-4" aria-hidden />}
            >
              Deny
            </Button>
            <Button
              type="button"
              onClick={() => approveMutation.mutate()}
              loading={approveMutation.isPending}
              disabled={!canSignApproval || denyMutation.isPending}
              icon={<Check className="size-4" aria-hidden />}
            >
              Sign & authorize
            </Button>
          </div>

          {actionError ? (
            <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm leading-6 text-danger">
              {actionError instanceof Error
                ? actionError.message
                : "Try again in a moment."}
            </p>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            AURA stores only the token hash after one-time handoff. The owner
            wallet key is never shared with the CLI.
          </p>
        </section>
      </div>
    </main>
  );
}

export function DeviceAuthorizationFlow() {
  const auth = useOwnerAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialCode = formatCodeInput(searchParams.get("code") ?? "");
  const [code, setCode] = useState(initialCode);
  const [activeCode, setActiveCode] = useState<string | null>(
    isCompleteCode(initialCode) ? initialCode : null,
  );
  const nextPath = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  const deviceQuery = useQuery({
    queryKey: ["conduit-device-code", activeCode],
    queryFn: async () =>
      readJson<DeviceCodeResponse>(
        await fetch(
          `/api/conduit/device/${encodeURIComponent(activeCode ?? "")}`,
          {
            credentials: "same-origin",
          },
        ),
      ),
    enabled: auth.isAuthenticated && Boolean(activeCode),
    retry: false,
  });

  const activateCode = () => {
    if (!isCompleteCode(code)) {
      return;
    }

    const formatted = formatCodeInput(code);
    setActiveCode(formatted);
    router.replace(`/conduit/device?code=${encodeURIComponent(formatted)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-[88px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="AURA home"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/conduit/sessions"
            className="hidden min-h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sessions
          </Link>
          <ThemeToggle className="h-10! w-10! min-w-10! rounded-md!" />
        </div>
      </header>

      {auth.isLoading ? (
        <LoadingPrompt />
      ) : !auth.isAuthenticated ? (
        <SignInPrompt next={nextPath} />
      ) : !activeCode ? (
        <InitialCodeForm
          code={code}
          setCode={setCode}
          onSubmit={activateCode}
        />
      ) : deviceQuery.isLoading ? (
        <LoadingPrompt />
      ) : deviceQuery.isError ? (
        <div className="mx-auto grid min-h-[calc(100dvh-88px)] max-w-md place-items-center px-4 py-10">
          <div className="w-full rounded-lg border border-danger/30 bg-danger/10 p-6">
            <XCircle className="size-8 text-danger" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-danger">
              Code not available
            </h1>
            <p className="mt-2 text-sm leading-6 text-danger/90">
              {deviceQuery.error instanceof Error
                ? deviceQuery.error.message
                : "Start a new Conduit login and try the fresh code."}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setActiveCode(null);
                setCode("");
                router.replace("/conduit/device");
              }}
              className="mt-5"
            >
              Enter another code
            </Button>
          </div>
        </div>
      ) : deviceQuery.data?.device ? (
        <ApprovalPrompt
          code={activeCode}
          device={deviceQuery.data.device}
          onReset={() => {
            setActiveCode(null);
            setCode("");
            router.replace("/conduit/device");
          }}
        />
      ) : (
        <InitialCodeForm
          code={code}
          setCode={setCode}
          onSubmit={activateCode}
        />
      )}
    </div>
  );
}
