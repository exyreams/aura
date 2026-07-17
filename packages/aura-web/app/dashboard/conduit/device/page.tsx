"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  PlugZap,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { Input } from "@/components/global/Input";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import { formatAddress } from "@/lib/formatting/addresses";

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

const expiryOptions = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "7", label: "7 days" },
  { value: "never", label: "No expiry" },
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

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span
      title={getAgentScopeLabel(scope)}
      className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
    >
      {scope}
    </span>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          mono ? "truncate text-right font-mono text-sm" : "text-right text-sm"
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function ConduitDevicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = formatCodeInput(searchParams.get("code") ?? "");
  const [code, setCode] = useState(initialCode);
  const [activeCode, setActiveCode] = useState<string | null>(
    isCompleteCode(initialCode) ? initialCode : null,
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCompleteCode(code)) {
      return;
    }

    const formatted = formatCodeInput(code);
    setActiveCode(formatted);
    router.replace(
      `/dashboard/conduit/device?code=${encodeURIComponent(formatted)}`,
    );
  };

  return (
    <DashboardContent>
      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Device login"
          title="Approve a Conduit client"
          description="Enter the short code printed by the CLI or agent runtime. Approval creates a scoped runtime token under your authenticated AURA account."
          action={<StatusBadge tone="success">Owner gated</StatusBadge>}
        />

        <form
          onSubmit={handleSubmit}
          className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <Input
            id="conduit-device-code"
            label="Device code"
            value={code}
            placeholder="ABCD-EFGH"
            autoComplete="one-time-code"
            spellCheck={false}
            inputMode="text"
            className="font-mono uppercase tracking-[0.24em]"
            onChange={(event) => setCode(formatCodeInput(event.target.value))}
            helperText="Run Conduit device login from the CLI, then enter the code shown there."
          />
          <div className="flex items-end">
            <Button
              type="submit"
              variant="primary"
              disabled={!isCompleteCode(code)}
              className="w-full sm:w-auto"
            >
              Look up
            </Button>
          </div>
        </form>
      </DashboardPanel>

      {activeCode ? (
        <DeviceApprovalPanel
          code={activeCode}
          onReset={() => {
            setActiveCode(null);
            setCode("");
            router.replace("/dashboard/conduit/device");
          }}
        />
      ) : (
        <DashboardEmptyState
          icon={PlugZap}
          title="Waiting for a device code"
          description="A Conduit CLI or AI client will show an 8-character code during login. Enter it here while it is still active."
        />
      )}
    </DashboardContent>
  );
}

function DeviceApprovalPanel({
  code,
  onReset,
}: {
  code: string;
  onReset: () => void;
}) {
  const auth = useOwnerAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [treasuryPda, setTreasuryPda] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [approvedSession, setApprovedSession] = useState<
    ApproveDeviceResponse["session"] | null
  >(null);

  const deviceQuery = useQuery({
    queryKey: ["conduit-device-code", code],
    queryFn: async () =>
      readJson<DeviceCodeResponse>(
        await fetch(`/api/conduit/device/${encodeURIComponent(code)}`, {
          credentials: "same-origin",
        }),
      ),
    retry: false,
  });

  const device = deviceQuery.data?.device ?? null;

  useEffect(() => {
    if (device?.requestedTreasuryPda) {
      setTreasuryPda(device.requestedTreasuryPda);
    }
  }, [device?.requestedTreasuryPda]);

  const approveMutation = useMutation({
    mutationFn: async () =>
      readJson<ApproveDeviceResponse>(
        await fetch(`/api/conduit/device/${encodeURIComponent(code)}/approve`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            treasuryPda: treasuryPda.trim() || null,
            scopes: device?.requestedScopes ?? ["read"],
            expiresInDays,
          }),
        }),
      ),
    onSuccess: async (payload) => {
      setApprovedSession(payload.session);
      toast.success("Conduit device approved", {
        description: "The client can retrieve its token on the next poll.",
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
      toast.danger("Could not approve device", {
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
      toast.success("Conduit device denied");
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

  const primaryWalletLabel = useMemo(
    () =>
      auth.primaryWallet
        ? formatAddress(auth.primaryWallet.wallet_address)
        : "No primary wallet",
    [auth.primaryWallet],
  );

  if (deviceQuery.isLoading) {
    return (
      <DashboardPanel className="grid gap-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded bg-muted" />
      </DashboardPanel>
    );
  }

  if (deviceQuery.isError) {
    return (
      <DashboardErrorState
        title="Could not load device code"
        description={
          deviceQuery.error instanceof Error
            ? deviceQuery.error.message
            : "Re-run device login and try the fresh code."
        }
        retryLabel="Try another code"
        onRetry={onReset}
      />
    );
  }

  if (!device) {
    return (
      <DashboardEmptyState
        icon={Clock}
        title="Device code not found"
        description="Re-run the Conduit login command and enter the fresh code before it expires."
        action={
          <Button type="button" variant="secondary" onClick={onReset}>
            Enter another code
          </Button>
        }
      />
    );
  }

  if (device.status !== "pending" || approvedSession) {
    return (
      <DashboardPanel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {device.status === "denied" || device.status === "expired" ? (
                <XCircle className="size-5 text-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="size-5 text-success" aria-hidden />
              )}
              <StatusBadge tone={statusTone(device.status)}>
                {device.status}
              </StatusBadge>
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              {approvedSession
                ? "Session approved"
                : `Device code ${device.status}`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {approvedSession
                ? "The client can retrieve its one-time token handoff. Manage the session from the Conduit sessions page."
                : "There is nothing else to approve for this code."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onReset}>
              Another code
            </Button>
            <Link
              href="/dashboard/conduit/sessions"
              className="inline-flex min-h-10 items-center justify-center rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
            >
              Manage sessions
            </Link>
          </div>
        </div>

        {approvedSession ? (
          <div className="mt-5 grid gap-2 rounded-md border border-border bg-background/40 p-3">
            <DetailRow label="Session" value={approvedSession.id} mono />
            <DetailRow label="Agent" value={approvedSession.agent_id} mono />
          </div>
        ) : null}
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="warning">Pending</StatusBadge>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {device.userCode}
            </span>
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {device.requestedAgentLabel ??
              device.requestedAgentId ??
              device.clientName ??
              "Conduit client"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review this request before issuing a scoped session token. The owner
            wallet signs nothing here; it only anchors the account that owns the
            token.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2">
          <ShieldCheck
            className={
              auth.primaryWallet ? "size-4 text-success" : "size-4 text-warning"
            }
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {primaryWalletLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <div className="grid gap-3 rounded-md border border-border bg-background/40 p-4">
          <DetailRow
            label="Client"
            value={device.clientName ?? "Conduit CLI"}
          />
          <DetailRow
            label="Agent ID"
            value={device.requestedAgentId ?? "Generated on approval"}
            mono
          />
          <DetailRow label="Created" value={formatDateTime(device.createdAt)} />
          <DetailRow label="Expires" value={formatDateTime(device.expiresAt)} />
          <DetailRow
            label="Requested treasury"
            value={
              device.requestedTreasuryPda
                ? formatAddress(device.requestedTreasuryPda)
                : "Unscoped"
            }
            mono={Boolean(device.requestedTreasuryPda)}
          />

          <div className="grid gap-2 pt-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Requested scopes
            </span>
            <div className="flex flex-wrap gap-1.5">
              {device.requestedScopes.map((scope) => (
                <ScopeChip key={scope} scope={scope} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-md border border-border bg-background/40 p-4">
          {!auth.primaryWallet ? (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
              <p className="text-sm font-medium text-warning">
                Primary wallet required
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Link and mark a primary owner wallet before approving Conduit
                device logins.
              </p>
              <Link
                href="/dashboard/settings"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Open settings
              </Link>
            </div>
          ) : null}

          <Input
            id="conduit-treasury-scope"
            label="Treasury scope"
            value={treasuryPda}
            placeholder="Optional treasury PDA"
            spellCheck={false}
            className="font-mono"
            onChange={(event) => setTreasuryPda(event.target.value)}
            helperText="Leave blank for read/session-only clients; set a PDA to scope treasury-aware tools."
          />

          <Dropdown
            label="Session expiry"
            value={expiresInDays}
            options={expiryOptions}
            onChange={setExpiresInDays}
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => denyMutation.mutate()}
              loading={denyMutation.isPending}
              disabled={approveMutation.isPending}
            >
              Deny
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => approveMutation.mutate()}
              loading={approveMutation.isPending}
              disabled={!auth.primaryWallet || denyMutation.isPending}
            >
              Approve
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            The raw bearer token is returned only once to the polling client and
            stored in Supabase only as a hash after handoff.
          </p>
        </div>
      </div>
    </DashboardPanel>
  );
}
