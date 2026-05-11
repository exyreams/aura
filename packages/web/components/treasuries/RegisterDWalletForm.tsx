"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { Tabs } from "@/components/global/Tabs";
import { Tooltip } from "@/components/global/Tooltip";
import { UsdInput } from "@/components/global/UsdInput";
import { Checkcircle, Copy, ExternalLink, Wallet } from "@/components/icons";
import {
  buildRegisterDwalletArgs,
  CHAINS,
  parsePublicKey,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface CreateDWalletResponse {
  dwalletId: string;
  dwalletAccount: string;
  authorizedUserPubkey: string;
  publicKeyHex: string;
  address: string;
  transferSignature: string;
  chain: number;
}

const emptyForm = {
  chain: String(CHAINS[2]?.code ?? 2),
  dwalletId: "",
  address: "",
  balanceUsd: "0",
  dwalletAccount: "",
  authorizedUserPubkey: "",
  messageMetadataDigest: "",
  publicKeyHex: "",
};

// ---------------------------------------------------------------------------
// Module-level sub-components (lifted out to avoid re-creation on each render)
// ---------------------------------------------------------------------------

function CreateContent({
  createResult,
  createMutation,
  selectedAgent,
  form,
  setForm,
  registerMutation,
}: {
  createResult: CreateDWalletResponse | null;
  createMutation: { isPending: boolean; mutate: () => void };
  selectedAgent: { agentId: string } | null;
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  registerMutation: { isPending: boolean };
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyVal = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (!createResult) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-(--card-content)/60 border border-border rounded-sm text-[12px] text-(--text-muted) leading-relaxed space-y-1">
          <p className="text-(--text-main) font-medium text-sm">
            Generate a new dWallet
          </p>
          <p>
            Creates a fresh Ed25519 dWallet on the Ika network using distributed
            key generation (DKG), then registers it on-chain with this treasury.
            Takes ~5–30 seconds.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 py-6">
          <Button
            variant="primary"
            icon={
              createMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Wallet size={16} animateOnHover />
              )
            }
            loading={createMutation.isPending}
            disabled={!selectedAgent || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-10"
          >
            {createMutation.isPending
              ? "Creating dWallet via Ika DKG…"
              : selectedAgent
                ? "Create dWallet"
                : "Select Agent First"}
          </Button>
          {createMutation.isPending && (
            <p className="text-[11px] text-(--text-muted) font-mono animate-pulse">
              Waiting for Ika network DKG response…
            </p>
          )}
        </div>
      </div>
    );
  }

  const network = "devnet";

  const rows: { label: string; value: string; explorerUrl?: string }[] = [
    {
      label: "dWallet Account",
      value: createResult.dwalletAccount,
      explorerUrl: `https://explorer.solana.com/address/${createResult.dwalletAccount}?cluster=${network}`,
    },
    {
      label: "Authorized User",
      value: createResult.authorizedUserPubkey,
      explorerUrl: `https://explorer.solana.com/address/${createResult.authorizedUserPubkey}?cluster=${network}`,
    },
    {
      label: "Public Key Hex",
      value: createResult.publicKeyHex,
    },
    {
      label: "Chain",
      value:
        CHAINS.find((c) => c.code === createResult.chain)?.label ?? "Solana",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
        <Checkcircle
          size={16}
          animateOnHover
          className="text-emerald-500 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--text-main)">
            dWallet created on Ika network
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px] text-(--text-muted)">
              Tx:
            </span>
            <Tooltip content={createResult.transferSignature}>
              <span className="font-mono text-[10px] text-(--text-muted)">
                {shortenAddress(createResult.transferSignature, 8, 6)}
              </span>
            </Tooltip>
            <Tooltip content="Copy tx">
              <button
                type="button"
                onClick={() => copyVal(createResult.transferSignature, "tx")}
                className="text-(--text-muted) hover:text-primary transition-colors"
              >
                <Copy size={10} animateOnHover />
              </button>
            </Tooltip>
            <Tooltip content="View on Explorer">
              <a
                href={`https://explorer.solana.com/tx/${createResult.transferSignature}?cluster=${network}`}
                target="_blank"
                rel="noreferrer"
                className="text-(--text-muted) hover:text-primary transition-colors"
              >
                <ExternalLink size={10} animateOnHover />
              </a>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="bg-(--card-content)/60 border border-border rounded-sm overflow-hidden">
        {rows.map((row, i) => {
          const isHash = row.value.length > 20;
          const display = isHash ? shortenAddress(row.value, 8, 6) : row.value;
          const isCopied = copiedKey === row.label;
          return (
            <div
              key={row.label}
              className={`flex items-center justify-between px-3 py-2.5 ${i < rows.length - 1 ? "border-b border-border" : ""}`}
            >
              <span className="mono text-[10px] uppercase tracking-wider text-(--text-muted) shrink-0">
                {row.label}
              </span>
              <span className="mono text-[11px] text-(--text-main) flex items-center gap-1.5">
                {isHash ? (
                  <Tooltip content={row.value}>
                    <span>{display}</span>
                  </Tooltip>
                ) : (
                  <span>{display}</span>
                )}
                {isHash && (
                  <>
                    <Tooltip content={isCopied ? "Copied!" : "Copy"}>
                      <button
                        type="button"
                        onClick={() => copyVal(row.value, row.label)}
                        className="text-(--text-muted) hover:text-primary transition-colors"
                      >
                        <Copy size={10} animateOnHover />
                      </button>
                    </Tooltip>
                    {row.explorerUrl && (
                      <Tooltip content="View on Explorer">
                        <a
                          href={row.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-(--text-muted) hover:text-primary transition-colors"
                        >
                          <ExternalLink size={10} animateOnHover />
                        </a>
                      </Tooltip>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <UsdInput
        label="Initial Balance"
        valueCents={form.balanceUsd}
        onChangeCents={(v) => setForm((f) => ({ ...f, balanceUsd: v }))}
        disabled={registerMutation.isPending}
      />
    </div>
  );
}

function ManualContent({
  form,
  setForm,
  anyPending,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  anyPending: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label
          htmlFor="chain-code"
          className="font-mono text-[10px] uppercase text-(--text-muted) font-bold mb-2 block"
        >
          Chain
        </label>
        <Dropdown
          options={CHAINS.map((chain) => ({
            value: String(chain.code),
            label: chain.label,
          }))}
          value={form.chain}
          onChange={(v) => setForm((f) => ({ ...f, chain: v }))}
          placeholder="Select chain"
        />
      </div>
      <Input
        label="dWallet ID"
        placeholder="DW-X-0192"
        value={form.dwalletId}
        onChange={(e) => setForm((f) => ({ ...f, dwalletId: e.target.value }))}
        disabled={anyPending}
      />
      <div className="md:col-span-2">
        <Input
          label="Address"
          placeholder="0x..."
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          disabled={anyPending}
        />
      </div>
      <UsdInput
        label="Balance"
        valueCents={form.balanceUsd}
        onChangeCents={(v) => setForm((f) => ({ ...f, balanceUsd: v }))}
        disabled={anyPending}
      />
      <Input
        label="Runtime dWallet account"
        placeholder="acc_8j2...9kx"
        value={form.dwalletAccount}
        onChange={(e) =>
          setForm((f) => ({ ...f, dwalletAccount: e.target.value }))
        }
        disabled={anyPending}
      />
      <Input
        label="Authorized user pubkey"
        placeholder="5u9...X7e"
        value={form.authorizedUserPubkey}
        onChange={(e) =>
          setForm((f) => ({ ...f, authorizedUserPubkey: e.target.value }))
        }
        disabled={anyPending}
      />
      <Input
        label="Message metadata digest"
        placeholder="sha256:..."
        value={form.messageMetadataDigest}
        onChange={(e) =>
          setForm((f) => ({ ...f, messageMetadataDigest: e.target.value }))
        }
        disabled={anyPending}
      />
      <div className="md:col-span-2">
        <Input
          label="Public key hex"
          placeholder="04c8..."
          value={form.publicKeyHex}
          onChange={(e) =>
            setForm((f) => ({ ...f, publicKeyHex: e.target.value }))
          }
          disabled={anyPending}
        />
      </div>
    </div>
  );
}

function CurrentContent({
  treasury,
  copiedId,
  onCopy,
  network,
}: {
  treasury: TreasuryEntry;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  network: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const registered = treasury.account.dwallets.filter(
    (dw) => dw.dwalletId.length > 0,
  );

  if (registered.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-border rounded-sm">
        <p className="text-sm text-(--text-muted)">
          No dWallets registered yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {registered.map((dw) => {
        const chainLabel =
          CHAINS.find((c) => c.code === dw.chain)?.label ?? "Unknown";
        const isExpanded = expandedId === dw.dwalletId;

        const chainIconMap: Record<string, string> = {
          Bitcoin: "/assets/bitcoin.svg",
          Ethereum: "/assets/ethereum.svg",
          Solana: "/assets/solana.svg",
          Polygon: "/assets/polygon.svg",
          Arbitrum: "/assets/arbitrum.svg",
          Optimism: "/assets/optimism.svg",
        };
        const chainIcon = chainIconMap[chainLabel];

        return (
          <div
            key={dw.dwalletId}
            className="border border-border rounded-sm overflow-hidden"
          >
            {/* Header row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : dw.dwalletId)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                setExpandedId(isExpanded ? null : dw.dwalletId)
              }
              className="w-full text-left p-4 bg-(--card-content)/60 hover:bg-(--hover-bg) transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-sm bg-(--card-bg) border border-border flex items-center justify-center shrink-0 p-1">
                    {chainIcon ? (
                      <Image
                        src={chainIcon}
                        alt={chainLabel}
                        width={24}
                        height={24}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-bold">{chainLabel[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-(--text-main)">
                        {chainLabel}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-success/40 bg-success/10 text-success">
                        Active
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-(--text-muted) truncate">
                        {dw.address
                          ? `${dw.address.slice(0, 8)}...${dw.address.slice(-6)}`
                          : "No address"}
                      </span>
                      {dw.address && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopy(dw.address, `addr-hdr-${dw.dwalletId}`);
                          }}
                          className="text-(--text-muted) hover:text-(--text-main) transition-colors shrink-0"
                        >
                          <Copy size={10} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-mono text-[10px] text-(--text-main)">
                        ${(Number(dw.balanceUsd.toString()) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 text-(--text-muted) transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </button>

            {/* Expanded detail rows */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <m.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="p-3 bg-(--card-bg) border-t border-border space-y-2">
                    {[
                      {
                        label: `${chainLabel} Address — send tokens here`,
                        value: dw.address,
                        key: `addr-${dw.dwalletId}`,
                        explorer: null,
                      },
                      {
                        label: "dWallet Account (Solana PDA)",
                        value: dw.dwalletId,
                        key: `dwid-${dw.dwalletId}`,
                        explorer: `https://explorer.solana.com/address/${dw.dwalletId}?cluster=${network}`,
                      },
                      {
                        label: "Authorized User (agent keypair)",
                        value: dw.authorizedUserPubkey?.toString?.() ?? null,
                        key: `auth-${dw.dwalletId}`,
                        explorer: null,
                      },
                      {
                        label: "Public Key Hex (signing key)",
                        value: dw.publicKeyHex ?? null,
                        key: `hex-${dw.dwalletId}`,
                        explorer: null,
                      },
                    ]
                      .filter((r) => r.value)
                      .map((row) => (
                        <div
                          key={row.key}
                          className="p-2 bg-(--card-content)/60 rounded-sm border border-border"
                        >
                          <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-0.5">
                            {row.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-(--text-main) break-all flex-1">
                              {row.value}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onCopy(row.value ?? "", row.key)}
                                className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                              >
                                <Copy size={11} />
                              </button>
                              {row.explorer && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(row.explorer ?? "", "_blank")
                                  }
                                  className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                                >
                                  <ExternalLink size={11} />
                                </button>
                              )}
                              {copiedId === row.key && (
                                <span className="text-[10px] text-(--success-text) font-mono">
                                  copied
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const RegisterDWalletForm = ({
  isOpen,
  onClose,
  treasury,
}: {
  isOpen: boolean;
  onClose: () => void;
  treasury: TreasuryEntry;
}) => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"create" | "manual" | "current">("create");
  const [form, setForm] = useState(emptyForm);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [createResult, setCreateResult] =
    useState<CreateDWalletResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (!isOpen) {
      setValidationError(null);
      setCreateResult(null);
      setForm(emptyForm);
      setTab("create");
      setCopiedId(null);
    }
  }, [isOpen]);
  // Step 1: Create dWallet via backend (DKG + transfer ownership)
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before creating a dWallet.",
        );
      }
      return postBackend<CreateDWalletResponse>(
        settings.backendUrl,
        "/v1/dwallet/create",
        {
          rpcUrl: settings.endpoint,
          programId: settings.programId || undefined,
          agentId: selectedAgent.agentId,
        },
      );
    },
    onSuccess: async (result) => {
      // Auto-fill the form with the values returned by the backend
      setCreateResult(result);
      setForm({
        chain: String(result.chain),
        dwalletId: result.dwalletId,
        address: result.address,
        balanceUsd: "0",
        dwalletAccount: result.dwalletAccount,
        authorizedUserPubkey: result.authorizedUserPubkey,
        messageMetadataDigest: "",
        publicKeyHex: result.publicKeyHex,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["treasury", treasury.publicKey.toBase58()],
        }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
    },
  });

  // Step 2: Register on-chain (wallet signs)
  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
      if (!form.dwalletId.trim()) throw new Error("dWallet ID is required.");
      if (!form.address.trim()) throw new Error("Address is required.");

      const args = buildRegisterDwalletArgs({
        chain: Number(form.chain),
        dwalletId: form.dwalletId,
        address: form.address,
        balanceUsd: Number(form.balanceUsd),
        dwalletAccount: form.dwalletAccount
          ? parsePublicKey(form.dwalletAccount)
          : null,
        authorizedUserPubkey: form.authorizedUserPubkey
          ? parsePublicKey(form.authorizedUserPubkey)
          : null,
        messageMetadataDigest: form.messageMetadataDigest || null,
        publicKeyHex: form.publicKeyHex || null,
      });

      const instruction = await client.registerDwalletInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        args,
      );

      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["treasury", treasury.publicKey.toBase58()],
        }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      // Register with backend — fire-and-forget
      postBackend(settings.backendUrl, "/v1/treasuries/register-dwallet", {
        treasuryAddress: treasury.publicKey.toBase58(),
        txSignature: result,
        dwalletId: form.dwalletId,
        dwalletAccount: form.dwalletAccount,
        chain: Number(form.chain),
        address: form.address,
        balanceUsd: Number(form.balanceUsd),
        publicKeyHex: form.publicKeyHex || undefined,
      }).catch(() => {});
      onClose();
    },
  });

  const handleManualSubmit = () => {
    if (!form.dwalletId.trim()) {
      setValidationError("dWallet ID is required.");
      return;
    }
    if (!form.address.trim()) {
      setValidationError("Address is required.");
      return;
    }
    setValidationError(null);
    registerMutation.mutate();
  };

  const anyPending = createMutation.isPending || registerMutation.isPending;

  const mutationError =
    createMutation.error instanceof Error
      ? createMutation.error.message
      : registerMutation.error instanceof Error
        ? registerMutation.error.message
        : validationError;

  // Create tab content
  // Manual tab content
  // Current dWallets tab

  const tabs = [
    {
      id: "create",
      label: "Create New",
      content: (
        <CreateContent
          createResult={createResult}
          createMutation={createMutation}
          selectedAgent={selectedAgent}
          form={form}
          setForm={setForm}
          registerMutation={registerMutation}
        />
      ),
    },
    {
      id: "manual",
      label: "Register Existing",
      content: (
        <ManualContent form={form} setForm={setForm} anyPending={anyPending} />
      ),
    },
    {
      id: "current",
      label: `Current (${treasury.account.dwallets.filter((dw) => dw.dwalletId.length > 0).length})`,
      content: (
        <CurrentContent
          treasury={treasury}
          copiedId={copiedId}
          onCopy={handleCopy}
          network={settings.network}
        />
      ),
    },
  ];

  // Footer changes based on tab and state
  const footer = (
    <div className="flex justify-between items-center w-full">
      <div className="flex-1">
        {mutationError && (
          <p className="text-sm text-(--danger-text)">{mutationError}</p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onClose} disabled={anyPending}>
          Cancel
        </Button>
        {tab === "create" ? (
          <Button
            variant="primary"
            loading={registerMutation.isPending}
            disabled={!createResult || registerMutation.isPending}
            onClick={() => registerMutation.mutate()}
          >
            Register on Treasury
          </Button>
        ) : tab === "manual" ? (
          <Button
            variant="primary"
            loading={registerMutation.isPending}
            disabled={registerMutation.isPending}
            onClick={handleManualSubmit}
          >
            Register dWallet
          </Button>
        ) : (
          // current tab — just close
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register dWallet"
      className="max-w-2xl"
      footer={footer}
    >
      <div className="min-h-[320px]">
        <Tabs
          tabs={tabs}
          defaultTab="create"
          layoutId="registerDwalletTabs"
          onChange={(id) => setTab(id as "create" | "manual" | "current")}
        />
      </div>
    </Modal>
  );
};
