"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Copy, ExternalLink, Loader2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { Tabs } from "@/components/global/Tabs";
import { UsdInput } from "@/components/global/UsdInput";
import {
  buildRegisterDwalletArgs,
  CHAINS,
  parsePublicKey,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";

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

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["treasury", treasury.publicKey.toBase58()],
    });
    await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
  };

  // ── Step 1: Create dWallet via backend (DKG + transfer ownership) ──
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
    onSuccess: (result) => {
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
    },
  });

  // ── Step 2: Register on-chain (wallet signs) ──
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
    onSuccess: async () => {
      await invalidate();
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

  // ── Create tab content ──
  const CreateContent = () => {
    if (!createResult) {
      return (
        <div className="space-y-6">
          <div className="p-4 bg-(--info-bg) border border-(--info-border) rounded-sm text-[12px] text-(--text-muted) leading-relaxed">
            This will call the Ika DKG service via the backend to generate a new
            Ed25519 dWallet, wait for the on-chain PDA to appear, then transfer
            ownership to AURA's CPI authority. Takes ~5–30 seconds.
            <br />
            <span className="text-(--text-main) font-medium">
              Backend must be running at {settings.backendUrl}
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 py-6">
            <Button
              variant="primary"
              icon={
                createMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Zap size={16} />
                )
              }
              loading={createMutation.isPending}
              disabled={!selectedAgent || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-10"
            >
              {createMutation.isPending
                ? "Creating dWallet via Ika DKG..."
                : selectedAgent
                  ? "Create dWallet"
                  : "Select Agent First"}
            </Button>
            {createMutation.isPending && (
              <p className="text-[11px] text-(--text-muted) font-mono animate-pulse">
                Waiting for Ika network DKG response...
              </p>
            )}
          </div>
        </div>
      );
    }

    // DKG succeeded — show result and register button
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
          <CheckCircle size={18} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-(--text-main)">
              dWallet created on Ika network
            </p>
            <p className="text-[11px] text-(--text-muted)">
              Tx:{" "}
              <span className="font-mono">
                {createResult.transferSignature.slice(0, 20)}...
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {[
            { label: "dWallet Account", value: createResult.dwalletAccount },
            {
              label: "Authorized User",
              value: createResult.authorizedUserPubkey,
            },
            {
              label: "Public Key Hex",
              value: `${createResult.publicKeyHex.slice(0, 24)}...`,
            },
            {
              label: "Chain",
              value:
                CHAINS.find((c) => c.code === createResult.chain)?.label ??
                "Solana",
            },
          ].map((row) => (
            <div
              key={row.label}
              className="flex justify-between items-center py-2 border-b border-border last:border-0"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-(--text-muted)">
                {row.label}
              </span>
              <span className="font-mono text-[11px] text-(--text-main) truncate max-w-[200px]">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div>
          <UsdInput
            label="Initial Balance"
            valueCents={form.balanceUsd}
            onChangeCents={(v) => setForm((f) => ({ ...f, balanceUsd: v }))}
            disabled={registerMutation.isPending}
          />
        </div>
      </div>
    );
  };

  // ── Manual tab content ──
  const ManualContent = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label
          htmlFor="chain-code"
          className="font-mono text-[10px] uppercase text-(--text-muted) font-bold mb-2 block"
        >
          Chain
        </label>
        <div className="relative">
          <select
            id="chain-code"
            className="bg-(--input-bg) border border-border rounded-sm px-4 py-3 text-sm outline-none w-full transition-colors text-(--text-main) focus:border-primary appearance-none"
            value={form.chain}
            onChange={(e) => setForm((f) => ({ ...f, chain: e.target.value }))}
            disabled={anyPending}
          >
            {CHAINS.map((chain) => (
              <option key={chain.code} value={chain.code}>
                {chain.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-(--text-muted)">
            <svg
              className="w-4 h-4 fill-current"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <title>Dropdown arrow</title>
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
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

  // ── Current dWallets tab ──
  const CurrentContent = () => {
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
      <div className="space-y-3">
        {registered.map((dw) => {
          const chainLabel =
            CHAINS.find((c) => c.code === dw.chain)?.label ?? "Unknown";
          return (
            <div
              key={dw.dwalletId}
              className="p-4 bg-(--card-content) border border-border rounded-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-sm bg-(--card-bg) border border-border flex items-center justify-center">
                    <span className="text-xs font-bold">{chainLabel[0]}</span>
                  </div>
                  <span className="text-sm font-semibold text-(--text-main)">
                    {chainLabel}
                  </span>
                </div>
                <span className="font-mono text-xs text-(--text-main)">
                  ${(Number(dw.balanceUsd.toString()) / 100).toFixed(2)}
                </span>
              </div>

              {/* dWallet account address */}
              <div className="p-2 bg-(--card-bg) rounded-sm border border-border">
                <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-0.5">
                  dWallet Account
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-(--text-main) break-all flex-1">
                    {dw.dwalletId}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(dw.dwalletId, `dw-${dw.dwalletId}`)
                    }
                    className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        `https://explorer.solana.com/address/${dw.dwalletId}?cluster=${settings.network}`,
                        "_blank",
                      )
                    }
                    className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
                  >
                    <ExternalLink size={11} />
                  </button>
                  {copiedId === `dw-${dw.dwalletId}` && (
                    <span className="text-[10px] text-(--success-text) font-mono shrink-0">
                      copied
                    </span>
                  )}
                </div>
              </div>

              {/* Native chain address */}
              {dw.address && (
                <div className="p-2 bg-(--card-bg) rounded-sm border border-border">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-0.5">
                    {chainLabel} Address
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-(--text-main) break-all flex-1">
                      {dw.address}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(dw.address, `addr-${dw.dwalletId}`)
                      }
                      className="shrink-0 text-(--text-muted) hover:text-(--text-main) transition-colors"
                    >
                      <Copy size={11} />
                    </button>
                    {copiedId === `addr-${dw.dwalletId}` && (
                      <span className="text-[10px] text-(--success-text) font-mono shrink-0">
                        copied
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const tabs = [
    {
      id: "create",
      label: "Create New",
      content: <CreateContent />,
    },
    {
      id: "manual",
      label: "Register Existing",
      content: <ManualContent />,
    },
    {
      id: "current",
      label: `Current (${treasury.account.dwallets.filter((dw) => dw.dwalletId.length > 0).length})`,
      content: <CurrentContent />,
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
      <Tabs
        tabs={tabs}
        defaultTab="create"
        layoutId="registerDwalletTabs"
        onChange={(id) => setTab(id as "create" | "manual" | "current")}
      />
    </Modal>
  );
};
