"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Upload,
  Wallet,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/global/Toast";
import { DWalletDetailsPanel } from "@/components/wallets/DWalletDetailsPanel";
import { AURA_CHAINS, SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgents, useAppSettings } from "@/lib/hooks";
import {
  confirmAgentTreasuryLink,
  confirmDWalletRegistration,
  createAgentTreasuryOnChain,
  getDWalletRegistrationBlocker,
  registerDWalletOnChain,
} from "@/lib/solana/dwallet-registration";
import type { WalletRegistryRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  walletAddressExplorerUrl,
  walletTransactionExplorerUrl,
} from "@/lib/wallets/dwallet-details";
import { Button } from "../global/Button";
import { Dropdown } from "../global/Dropdown";
import { FieldGroup } from "../global/FieldGroup";
import { Input } from "../global/Input";
import { Modal } from "../global/Modal";
import { StatusBadge } from "../global/StatusBadge";

type RegisterMode = "register" | "provision";
type ProviderMode = "ika";

interface RegisterDWalletResponse {
  wallet: WalletRegistryRow;
  dwalletSession: {
    id: string;
    provider: "manual" | "ika" | "conduit";
    status: string;
    createdAt: string;
    hasEncryptedSession: boolean;
  };
}

const emptyForm = {
  mode: "provision" as RegisterMode,
  provider: "ika" as ProviderMode,
  agentSessionId: "",
  chainId: String(SOLANA_CHAIN_ID),
  label: "",
  chainAddress: "",
  dwalletId: "",
  dwalletStatePda: "",
  dwalletAccount: "",
  authorizedUserPubkey: "",
  messageMetadataDigest: "",
  publicKeyHex: "",
  registrationTxSignature: "",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not register dWallet.";
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function importString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function importChainId(record: Record<string, unknown>) {
  const value = record.chainId ?? record.chain_id;

  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "";
}

function parseDWalletDetailsImport(payload: unknown) {
  const root = objectRecord(payload);
  const wallet = objectRecord(root?.wallet) ?? root;

  if (!wallet) {
    throw new Error("Choose a valid dWallet details JSON file.");
  }

  const chainAddress = importString(
    wallet,
    "depositAddress",
    "chainAddress",
    "chain_address",
    "address",
  );
  const dwalletId = importString(wallet, "dwalletId", "dwallet_id");

  if (!chainAddress || !dwalletId) {
    throw new Error(
      "The imported file must include a deposit address and dWallet ID.",
    );
  }

  return {
    label: importString(wallet, "label"),
    chainId: importChainId(wallet),
    chainAddress,
    dwalletId,
    dwalletStatePda: importString(
      wallet,
      "dwalletStatePda",
      "dwallet_state_pda",
    ),
    dwalletAccount: importString(
      wallet,
      "runtimeDwalletAccount",
      "dwalletAccount",
      "dwallet_account",
    ),
    authorizedUserPubkey: importString(
      wallet,
      "authorizedUserPubkey",
      "authorized_user_pubkey",
    ),
    messageMetadataDigest: importString(
      wallet,
      "messageMetadataDigest",
      "message_metadata_digest",
    ),
    publicKeyHex: importString(wallet, "publicKeyHex", "public_key_hex"),
    registrationTxSignature: importString(
      wallet,
      "registrationTxSignature",
      "registration_tx_signature",
    ),
  };
}

async function postDWallet(
  body: typeof emptyForm,
): Promise<RegisterDWalletResponse> {
  const response = await fetch("/api/wallets/dwallets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: body.mode,
      provider: body.provider,
      agentSessionId: body.agentSessionId,
      chainId: Number(body.chainId),
      label: body.label,
      chainAddress: body.chainAddress,
      dwalletId: body.dwalletId,
      dwalletStatePda: body.dwalletStatePda,
      dwalletAccount: body.dwalletAccount,
      authorizedUserPubkey: body.authorizedUserPubkey,
      messageMetadataDigest: body.messageMetadataDigest,
      publicKeyHex: body.publicKeyHex,
      registrationTxSignature: body.registrationTxSignature,
    }),
  });
  const payload = (await response.json()) as
    | RegisterDWalletResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Could not register dWallet.",
    );
  }

  return payload as RegisterDWalletResponse;
}

export function RegisterDWalletModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { connection } = useConnection();
  const ownerWallet = useWallet();
  const importInputRef = useRef<HTMLInputElement>(null);
  const settings = useAppSettings();
  const { agents, selectedAgent } = useAgents();
  const activeAgents = useMemo(
    () =>
      agents.filter((agent) => agent.status === "active" && agent.publicKey),
    [agents],
  );
  const [form, setForm] = useState(emptyForm);
  const [copied, setCopied] = useState(false);
  const [linkedWallet, setLinkedWallet] = useState<WalletRegistryRow | null>(
    null,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedAgentForForm =
    activeAgents.find((agent) => agent.id === form.agentSessionId) ?? null;

  const linkMutation = useMutation({
    mutationFn: async (createdWallet: WalletRegistryRow) => {
      const ownerAddress = ownerWallet.publicKey?.toBase58();

      if (!ownerAddress) {
        throw new Error(
          "dWallet created. Connect the owner wallet to complete treasury creation and on-chain registration.",
        );
      }

      let treasurySignature: string | null = null;
      let walletForRegistration = createdWallet;

      if (!walletForRegistration.treasury_pda) {
        if (!createdWallet.agent_session_id) {
          throw new Error(
            "This dWallet is not attached to a signer agent session.",
          );
        }

        const agent =
          activeAgents.find(
            (candidate) => candidate.id === createdWallet.agent_session_id,
          ) ?? selectedAgentForForm;

        if (!agent) {
          throw new Error(
            "Could not find the signer agent for this dWallet. Refresh agents and try again.",
          );
        }

        const treasury = await createAgentTreasuryOnChain({
          connection,
          walletAdapter: ownerWallet,
          agent,
          programId: settings.resolvedProgramId,
        });

        if (!treasury.signature) {
          throw new Error(
            "This signer agent has a treasury, but this wallet registry row is stale. Refresh the page and try again.",
          );
        }

        await confirmAgentTreasuryLink({
          agentSessionId: agent.id,
          ownerAddress,
          treasuryPda: treasury.treasuryPda,
          signature: treasury.signature,
        });

        treasurySignature = treasury.signature;
        walletForRegistration = {
          ...walletForRegistration,
          treasury_pda: treasury.treasuryPda,
        };
      }

      const signature = await registerDWalletOnChain({
        connection,
        walletAdapter: ownerWallet,
        wallet: walletForRegistration,
        programId: settings.resolvedProgramId,
      });
      const linkedWallet = await confirmDWalletRegistration({
        walletId: createdWallet.id,
        ownerAddress,
        signature,
      });

      return { signature, treasurySignature, wallet: linkedWallet };
    },
    onSuccess: async ({ signature, treasurySignature, wallet: nextWallet }) => {
      setLinkedWallet(nextWallet);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-registry"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      toast.success("dWallet linked on-chain", {
        description: treasurySignature
          ? "The owner wallet created the AURA treasury and registered the dWallet."
          : "The owner wallet signed the AURA registration transaction.",
        action: {
          label: "View transaction",
          href: walletTransactionExplorerUrl(signature),
        },
      });
    },
    onError: (error) => {
      toast.danger("dWallet created, link pending", {
        description:
          error instanceof Error
            ? error.message
            : "Use Link on-chain from the wallet card when you are ready.",
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async () => postDWallet(form),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet-registry"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);

      const signature = form.registrationTxSignature.trim();
      toast.success(
        form.mode === "provision" ? "dWallet created" : "dWallet registered",
        {
          description:
            "Review the dWallet details, then complete the owner-wallet on-chain registration.",
          action: {
            label: signature ? "View transaction" : "View address",
            href: signature
              ? walletTransactionExplorerUrl(signature)
              : walletAddressExplorerUrl(data.wallet.chain_address),
          },
        },
      );
    },
    onError: (error) => {
      toast.danger("Could not register dWallet", {
        description: getErrorMessage(error),
      });
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm((current) => ({
      ...current,
      agentSessionId:
        current.agentSessionId ||
        activeAgents.find((agent) => agent.id === selectedAgent?.id)?.id ||
        activeAgents[0]?.id ||
        "",
    }));
    setValidationError(null);
    mutation.reset();
    linkMutation.reset();
    setLinkedWallet(null);
    setCopied(false);
  }, [
    activeAgents,
    linkMutation.reset,
    mutation.reset,
    open,
    selectedAgent?.id,
  ]);

  const updateForm = <Key extends keyof typeof emptyForm>(
    key: Key,
    value: (typeof emptyForm)[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  };

  const resetAndClose = () => {
    if (mutation.isPending || linkMutation.isPending) {
      return;
    }

    onClose();
    window.setTimeout(() => {
      setForm(emptyForm);
      setValidationError(null);
      setCopied(false);
      setLinkedWallet(null);
      mutation.reset();
      linkMutation.reset();
    }, 160);
  };

  const validate = () => {
    if (!form.agentSessionId) {
      return "Choose the signer agent that owns this wallet.";
    }

    if (form.mode === "register") {
      if (!form.chainAddress.trim()) {
        return "Wallet address is required.";
      }

      if (!form.dwalletId.trim()) {
        return "dWallet ID is required.";
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // React Query owns the visible error state and failure toast.
    }
  };

  const registeredWallet = linkedWallet ?? mutation.data?.wallet ?? null;
  const registeredWalletIsOnChain =
    registeredWallet?.status === "onchain_registered";
  const registeredWalletBlocker = registeredWallet
    ? getDWalletRegistrationBlocker(registeredWallet)
    : null;
  const submitError =
    validationError ??
    (mutation.isError ? getErrorMessage(mutation.error) : null);

  const copyRegisteredAddress = async () => {
    if (!registeredWallet) {
      return;
    }

    await navigator.clipboard.writeText(registeredWallet.chain_address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const importDWalletDetails = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const imported = parseDWalletDetailsImport(JSON.parse(await file.text()));

      setForm((current) => ({
        ...current,
        mode: "register",
        label: imported.label || current.label,
        chainId: imported.chainId || current.chainId,
        chainAddress: imported.chainAddress,
        dwalletId: imported.dwalletId,
        dwalletStatePda: imported.dwalletStatePda,
        dwalletAccount: imported.dwalletAccount,
        authorizedUserPubkey: imported.authorizedUserPubkey,
        messageMetadataDigest: imported.messageMetadataDigest,
        publicKeyHex: imported.publicKeyHex,
        registrationTxSignature: imported.registrationTxSignature,
      }));
      setValidationError(null);
      toast.success("dWallet details imported", {
        description: "Review the signer agent before registering.",
      });
    } catch (error) {
      setValidationError(getErrorMessage(error));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={resetAndClose}
      ariaLabelledBy="register-dwallet-title"
      ariaDescribedBy="register-dwallet-description"
      className="sm:max-w-2xl"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
            {registeredWallet ? (
              <Check className="size-5 text-success" aria-hidden="true" />
            ) : (
              <Wallet className="size-5 text-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h2 id="register-dwallet-title" className="text-lg font-semibold">
              {registeredWallet
                ? registeredWalletIsOnChain
                  ? "dWallet linked"
                  : "dWallet created"
                : "Register dWallet"}
            </h2>
            <p
              id="register-dwallet-description"
              className="mt-1 text-sm leading-6 text-muted-foreground"
            >
              {registeredWallet
                ? registeredWalletIsOnChain
                  ? "The wallet is linked to a signer agent and registered on-chain."
                  : "The wallet is saved to the dashboard. Complete the owner-wallet on-chain link before agent execution uses it."
                : "Create a real Ika dWallet for a signer agent, or register an existing dWallet you already control."}
            </p>
          </div>
        </div>

        {registeredWallet ? (
          <div className="grid gap-4">
            <div className="rounded-md border border-success/30 bg-success/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">
                  {mutation.data?.dwalletSession.status ?? "registered"}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  {mutation.data?.dwalletSession.provider ?? "manual"}
                </StatusBadge>
                {mutation.data?.dwalletSession.hasEncryptedSession ? (
                  <StatusBadge tone="success">encrypted session</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">metadata only</StatusBadge>
                )}
              </div>
              <p className="mt-3 font-mono text-xs text-success">
                {registeredWallet.label ?? registeredWallet.chain_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {registeredWallet.chain_address}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => void copyRegisteredAddress()}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <a
                  href={walletAddressExplorerUrl(
                    registeredWallet.chain_address,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-surface px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Explorer
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>

            <DWalletDetailsPanel wallet={registeredWallet} />

            {!registeredWalletBlocker ? (
              <Button
                type="button"
                variant="secondary"
                loading={linkMutation.isPending}
                onClick={() => linkMutation.mutate(registeredWallet)}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Register on-chain
              </Button>
            ) : registeredWallet.status !== "onchain_registered" &&
              registeredWallet.dwallet_id ? (
              <Button
                type="button"
                variant="secondary"
                loading={linkMutation.isPending}
                onClick={() => linkMutation.mutate(registeredWallet)}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Create treasury and register
              </Button>
            ) : registeredWallet.status !== "onchain_registered" ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                {registeredWalletBlocker}
              </div>
            ) : null}

            <Button
              type="button"
              onClick={resetAndClose}
              disabled={linkMutation.isPending}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-1">
              <Button
                type="button"
                variant={form.mode === "provision" ? "primary" : "ghost"}
                size="small"
                onClick={() => updateForm("mode", "provision")}
                className="min-h-9"
              >
                Create new
              </Button>
              <Button
                type="button"
                variant={form.mode === "register" ? "primary" : "ghost"}
                size="small"
                onClick={() => updateForm("mode", "register")}
                className="min-h-9"
              >
                Register existing
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Dropdown
                label="Signer agent"
                value={form.agentSessionId}
                onChange={(value) => updateForm("agentSessionId", value)}
                options={activeAgents.map((agent) => ({
                  value: agent.id,
                  label: agent.label,
                  badge: agent.treasuryPda ? "bound" : "agent",
                }))}
                placeholder="Choose signer agent"
                disabled={activeAgents.length === 0 || mutation.isPending}
              />

              <Dropdown
                label="Chain"
                value={form.chainId}
                onChange={(value) => updateForm("chainId", value)}
                options={AURA_CHAINS.map((chain) => ({
                  value: String(chain.id),
                  label: chain.name,
                  badge: chain.supportsLiveBalance ? "live" : "metadata",
                }))}
                disabled={mutation.isPending}
              />
            </div>

            {selectedAgentForForm ? (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      selectedAgentForForm.treasuryPda ? "success" : "warning"
                    }
                  >
                    {selectedAgentForForm.treasuryPda
                      ? "treasury bound"
                      : "treasury pending"}
                  </StatusBadge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedAgentForForm.treasuryPda
                      ? formatAddress(selectedAgentForForm.treasuryPda)
                      : "Wallet will stay agent-linked until on-chain binding is recorded."}
                  </span>
                </div>
              </div>
            ) : null}

            <Input
              label="Wallet label"
              value={form.label}
              onChange={(event) => updateForm("label", event.target.value)}
              placeholder="Optional display name"
              disabled={mutation.isPending}
            />

            {form.mode === "provision" ? (
              <FieldGroup label="Ika dWallet">
                <div className="grid gap-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Creates a dWallet through Ika DKG, encrypts the session
                    material server-side, and saves the fundable address in this
                    dashboard. On-chain registration stays as the next explicit
                    owner-wallet signing step.
                  </p>
                </div>
              </FieldGroup>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Import details JSON</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Load an AURA dWallet details export to fill the public
                      metadata fields.
                    </p>
                  </div>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={(event) => void importDWalletDetails(event)}
                    disabled={mutation.isPending}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => importInputRef.current?.click()}
                    disabled={mutation.isPending}
                    className="shrink-0"
                  >
                    <Upload className="size-3.5" aria-hidden="true" />
                    Import JSON
                  </Button>
                </div>

                <FieldGroup label="Required public metadata">
                  <div className="grid gap-4">
                    <Input
                      label="dWallet ID"
                      value={form.dwalletId}
                      onChange={(event) =>
                        updateForm("dwalletId", event.target.value)
                      }
                      placeholder="dWallet public identifier"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="Deposit address"
                      value={form.chainAddress}
                      onChange={(event) =>
                        updateForm("chainAddress", event.target.value)
                      }
                      placeholder={
                        form.chainId === String(SOLANA_CHAIN_ID)
                          ? "Solana wallet address"
                          : "Chain wallet address"
                      }
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </FieldGroup>

                <FieldGroup label="On-chain and runtime details">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="State PDA"
                      value={form.dwalletStatePda}
                      onChange={(event) =>
                        updateForm("dwalletStatePda", event.target.value)
                      }
                      placeholder="Optional Solana PDA"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="dWallet account"
                      value={form.dwalletAccount}
                      onChange={(event) =>
                        updateForm("dwalletAccount", event.target.value)
                      }
                      placeholder="Optional Solana account"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="Authorized user"
                      value={form.authorizedUserPubkey}
                      onChange={(event) =>
                        updateForm("authorizedUserPubkey", event.target.value)
                      }
                      placeholder="Optional agent authority"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="Registration tx"
                      value={form.registrationTxSignature}
                      onChange={(event) =>
                        updateForm(
                          "registrationTxSignature",
                          event.target.value,
                        )
                      }
                      placeholder="Optional signature"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="Metadata digest"
                      value={form.messageMetadataDigest}
                      onChange={(event) =>
                        updateForm("messageMetadataDigest", event.target.value)
                      }
                      placeholder="Optional digest"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      label="Public key hex"
                      value={form.publicKeyHex}
                      onChange={(event) =>
                        updateForm("publicKeyHex", event.target.value)
                      }
                      placeholder="Optional hex"
                      disabled={mutation.isPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </FieldGroup>
              </div>
            )}

            {submitError ? (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="whitespace-pre-wrap">{submitError}</span>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                onClick={resetAndClose}
                disabled={mutation.isPending || linkMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                loading={mutation.isPending}
                disabled={activeAgents.length === 0}
                className={cn(activeAgents.length === 0 && "opacity-60")}
              >
                {form.mode === "provision"
                  ? "Create dWallet"
                  : "Register dWallet"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
