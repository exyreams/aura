"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/global/Toast";
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
  mode: "register" as RegisterMode,
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

function addressExplorerUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function transactionExplorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not register dWallet.";
}

function metadataNestedString(
  metadata: WalletRegistryRow["metadata"],
  parent: string,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" ? nested : null;
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
  const settings = useAppSettings();
  const { agents, selectedAgent } = useAgents();
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status === "active"),
    [agents],
  );
  const [form, setForm] = useState(emptyForm);
  const [copied, setCopied] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState<string | null>(null);
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
          href: transactionExplorerUrl(signature),
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
              ? transactionExplorerUrl(signature)
              : addressExplorerUrl(data.wallet.chain_address),
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
    setCopiedDetail(null);
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
      setCopiedDetail(null);
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
  const registeredWalletDetails = registeredWallet
    ? [
        {
          label: "Deposit address",
          value: registeredWallet.chain_address,
          explorer: addressExplorerUrl(registeredWallet.chain_address),
        },
        {
          label: "dWallet ID",
          value: registeredWallet.dwallet_id,
          explorer: registeredWallet.dwallet_id
            ? addressExplorerUrl(registeredWallet.dwallet_id)
            : null,
        },
        {
          label: "Runtime dWallet account",
          value:
            metadataNestedString(
              registeredWallet.metadata,
              "dwallet",
              "dwallet_account",
            ) ?? registeredWallet.dwallet_state_pda,
          explorer:
            (metadataNestedString(
              registeredWallet.metadata,
              "dwallet",
              "dwallet_account",
            ) ?? registeredWallet.dwallet_state_pda)
              ? addressExplorerUrl(
                  metadataNestedString(
                    registeredWallet.metadata,
                    "dwallet",
                    "dwallet_account",
                  ) ??
                    registeredWallet.dwallet_state_pda ??
                    "",
                )
              : null,
        },
        {
          label: "Authorized user",
          value: metadataNestedString(
            registeredWallet.metadata,
            "dwallet",
            "authorized_user_pubkey",
          ),
        },
        {
          label: "Public key hex",
          value: metadataNestedString(
            registeredWallet.metadata,
            "dwallet",
            "public_key_hex",
          ),
        },
        {
          label: "Metadata digest",
          value: metadataNestedString(
            registeredWallet.metadata,
            "dwallet",
            "message_metadata_digest",
          ),
        },
        {
          label: "AURA treasury",
          value: registeredWallet.treasury_pda,
          explorer: registeredWallet.treasury_pda
            ? addressExplorerUrl(registeredWallet.treasury_pda)
            : null,
        },
      ].filter(
        (
          row,
        ): row is { label: string; value: string; explorer?: string | null } =>
          Boolean(row.value),
      )
    : [];
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

  const copyDetail = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedDetail(label);
    window.setTimeout(() => setCopiedDetail(null), 1500);
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
                  href={addressExplorerUrl(registeredWallet.chain_address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-surface px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Explorer
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>

            {registeredWalletDetails.length > 0 ? (
              <div className="grid gap-2">
                {registeredWalletDetails.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {row.label}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                        {row.value}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyDetail(row.label, row.value)}
                        className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label={`Copy ${row.label}`}
                      >
                        {copiedDetail === row.label ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                      {row.explorer ? (
                        <a
                          href={row.explorer}
                          target="_blank"
                          rel="noreferrer"
                          className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          aria-label={`Open ${row.label} in explorer`}
                        >
                          <ExternalLink
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

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
