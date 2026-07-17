"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Send, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { FieldGroup } from "@/components/global/FieldGroup";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Textarea } from "@/components/global/Textarea";
import { hasAgentWalletPermission } from "@/lib/agents/wallet-permissions";
import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgents, useAgentWalletPermissions } from "@/lib/hooks";
import { formatRawAmount, parseDecimalAmount } from "@/lib/solana/amounts";
import type { SolanaWalletBalances, TokenBalance } from "@/lib/solana/balances";
import {
  createNativeSolTransferDraft,
  type NativeSolTransferDraft,
  simulateTransferDraft,
} from "@/lib/solana/transfers";
import type { WalletRegistryRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type TransferPhase = "form" | "review" | "success";
type TransferMode = "wallet_signed" | "agent_request";

interface TransferAsset {
  id: string;
  kind: "native" | "token";
  symbol: string;
  name: string;
  decimals: number;
  rawAmount: string;
  displayAmount: string;
  tokenMint: string | null;
  tokenProgram: string | null;
  sourceTokenAccount: string | null;
}

interface TransferDraft {
  asset: TransferAsset;
  recipientAddress: string;
  amountUi: string;
  rawAmount: bigint;
  mode: TransferMode;
  agentSessionId: string | null;
  note: string | null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("user rejected") || message.includes("rejected")) {
      return "Wallet signature was cancelled.";
    }

    return error.message;
  }

  return "Transfer failed.";
}

function tokenName(token: TokenBalance) {
  return token.name ?? token.symbol;
}

function buildAssets(balance: SolanaWalletBalances | null): TransferAsset[] {
  if (!balance) {
    return [];
  }

  return [
    {
      id: "native:SOL",
      kind: "native",
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      rawAmount: String(balance.native.lamports),
      displayAmount: formatRawAmount(BigInt(balance.native.lamports), 9),
      tokenMint: null,
      tokenProgram: null,
      sourceTokenAccount: null,
    },
    ...balance.tokens.map((token) => ({
      id: `token:${token.tokenAccount}`,
      kind: "token" as const,
      symbol: token.symbol,
      name: tokenName(token),
      decimals: token.decimals,
      rawAmount: token.rawAmount,
      displayAmount: formatRawAmount(token.rawAmount, token.decimals),
      tokenMint: token.mint,
      tokenProgram: token.tokenProgram,
      sourceTokenAccount: token.tokenAccount,
    })),
  ];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

export function WalletTransferModal({
  open,
  wallet,
  balance,
  onClose,
}: {
  open: boolean;
  wallet: WalletRegistryRow;
  balance: SolanaWalletBalances | null;
  onClose: () => void;
}) {
  const { connection } = useConnection();
  const walletAdapter = useWallet();
  const queryClient = useQueryClient();
  const { agents } = useAgents();
  const permissionsQuery = useAgentWalletPermissions();
  const assets = useMemo(() => buildAssets(balance), [balance]);
  const linkedAgent = useMemo(
    () =>
      wallet.agent_session_id
        ? (agents.find((agent) => agent.id === wallet.agent_session_id) ?? null)
        : null,
    [agents, wallet.agent_session_id],
  );
  const [phase, setPhase] = useState<TransferPhase>("form");
  const [assetId, setAssetId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [transferDraft, setTransferDraft] =
    useState<NativeSolTransferDraft | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset =
    assets.find((asset) => asset.id === assetId) ?? assets[0] ?? null;
  const connectedAddress = walletAdapter.publicKey?.toBase58() ?? null;
  const canWalletSignSource =
    wallet.chain_id === SOLANA_CHAIN_ID &&
    connectedAddress === wallet.chain_address;
  const currentMode: TransferMode =
    canWalletSignSource && selectedAsset?.kind === "native"
      ? "wallet_signed"
      : "agent_request";
  const linkedAgentHasTransferGrant =
    currentMode !== "agent_request" ||
    Boolean(
      linkedAgent &&
        hasAgentWalletPermission(
          permissionsQuery.data ?? [],
          wallet.id,
          linkedAgent.id,
          "wallet:transfer",
        ),
    );

  useEffect(() => {
    if (!open) {
      setPhase("form");
      setRecipient("");
      setAmount("");
      setNote("");
      setDraft(null);
      setTransferDraft(null);
      setSignature(null);
      setRequestId(null);
      setBusy(false);
      setError(null);
      return;
    }

    setAssetId((current) => current || assets[0]?.id || "");
  }, [assets, open]);

  const resetToForm = () => {
    setPhase("form");
    setDraft(null);
    setTransferDraft(null);
    setSignature(null);
    setRequestId(null);
    setError(null);
  };

  const handleReview = () => {
    setError(null);

    if (!selectedAsset) {
      setError("No transferable asset is loaded yet.");
      return;
    }

    let recipientAddress: string;
    let rawAmount: bigint;

    try {
      recipientAddress = new PublicKey(recipient.trim()).toBase58();
      rawAmount = parseDecimalAmount(amount, selectedAsset.decimals);
    } catch (cause) {
      setError(getErrorMessage(cause));
      return;
    }

    if (rawAmount > BigInt(selectedAsset.rawAmount)) {
      setError(`Amount exceeds the ${selectedAsset.symbol} balance.`);
      return;
    }

    if (currentMode === "agent_request" && !linkedAgent) {
      setError("This wallet is not linked to a signer agent.");
      return;
    }

    if (
      currentMode === "agent_request" &&
      !linkedAgent?.scopes.includes("wallet:transfer")
    ) {
      setError("The linked signer agent is missing the wallet:transfer scope.");
      return;
    }

    if (currentMode === "agent_request" && permissionsQuery.isLoading) {
      setError("Wallet permissions are still loading. Try again in a moment.");
      return;
    }

    if (currentMode === "agent_request" && !linkedAgentHasTransferGrant) {
      setError(
        "Grant wallet transfer access to the linked signer agent before creating a transfer request.",
      );
      return;
    }

    setDraft({
      asset: selectedAsset,
      recipientAddress,
      amountUi: amount.trim(),
      rawAmount,
      mode: currentMode,
      agentSessionId:
        currentMode === "agent_request" ? (linkedAgent?.id ?? null) : null,
      note: note.trim() || null,
    });
    setTransferDraft(null);
    setPhase("review");
  };

  const handlePreflight = async () => {
    if (!draft || !walletAdapter.publicKey) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const nextTransferDraft = await createNativeSolTransferDraft({
        connection,
        fromPubkey: walletAdapter.publicKey,
        toPubkey: new PublicKey(draft.recipientAddress),
        lamports: draft.rawAmount,
      });
      await simulateTransferDraft(connection, nextTransferDraft.transaction);
      setTransferDraft(nextTransferDraft);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleWalletSend = async () => {
    if (!draft || !transferDraft) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const txSignature = await walletAdapter.sendTransaction(
        transferDraft.transaction,
        connection,
        { preflightCommitment: "confirmed" },
      );
      await connection.confirmTransaction(
        {
          signature: txSignature,
          blockhash: transferDraft.blockhash,
          lastValidBlockHeight: transferDraft.lastValidBlockHeight,
        },
        "confirmed",
      );

      await postJson<{ ok: boolean }>("/api/wallets/transfer-events", {
        walletId: wallet.id,
        signature: txSignature,
        recipientAddress: draft.recipientAddress,
        amountUi: draft.amountUi,
        rawAmount: draft.rawAmount.toString(),
        decimals: draft.asset.decimals,
        assetSymbol: draft.asset.symbol,
        blockhash: transferDraft.blockhash,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
        queryClient.invalidateQueries({ queryKey: ["solana-wallet-balance"] }),
      ]);
      setSignature(txSignature);
      setPhase("success");
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!draft?.agentSessionId) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await postJson<{
        signRequest: { id: string };
      }>("/api/wallets/transfer-requests", {
        walletId: wallet.id,
        agentSessionId: draft.agentSessionId,
        recipientAddress: draft.recipientAddress,
        amountUi: draft.amountUi,
        rawAmount: draft.rawAmount.toString(),
        decimals: draft.asset.decimals,
        assetKind: draft.asset.kind,
        assetSymbol: draft.asset.symbol,
        assetName: draft.asset.name,
        tokenMint: draft.asset.tokenMint,
        tokenProgram: draft.asset.tokenProgram,
        sourceTokenAccount: draft.asset.sourceTokenAccount,
        note: draft.note,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sign-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      setRequestId(response.signRequest.id);
      setPhase("success");
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const modalTitle =
    phase === "success"
      ? draft?.mode === "wallet_signed"
        ? "Transfer submitted"
        : "Request created"
      : phase === "review"
        ? "Review transfer"
        : "Transfer funds";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="wallet-transfer-title"
      ariaDescribedBy="wallet-transfer-description"
      className="sm:max-w-2xl"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2 id="wallet-transfer-title" className="text-lg font-semibold">
            {modalTitle}
          </h2>
          <p
            id="wallet-transfer-description"
            className="mt-1 text-sm leading-6 text-muted-foreground"
          >
            {currentMode === "wallet_signed"
              ? "Connected owner-wallet SOL transfers are signed directly in your wallet."
              : "dWallet and token transfers are queued for this wallet's linked signer agent."}
          </p>
        </div>

        {phase === "form" ? (
          <div className="grid gap-4">
            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{wallet.wallet_kind}</StatusBadge>
                <StatusBadge
                  tone={currentMode === "wallet_signed" ? "success" : "warning"}
                >
                  {currentMode === "wallet_signed"
                    ? "wallet signed"
                    : "agent request"}
                </StatusBadge>
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Source {formatAddress(wallet.chain_address)}
              </p>
            </div>

            <Dropdown
              label="Asset"
              value={selectedAsset?.id}
              onChange={(value) => {
                setAssetId(value);
                setDraft(null);
                setTransferDraft(null);
              }}
              options={assets.map((asset) => ({
                value: asset.id,
                label: `${asset.symbol} - ${asset.displayAmount} available`,
                badge: asset.kind,
              }))}
              placeholder="Load balances first"
              disabled={assets.length === 0}
            />

            <Input
              label="Recipient address"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="Solana recipient address"
              spellCheck={false}
              autoComplete="off"
            />

            <Input
              label="Amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              helperText={
                selectedAsset
                  ? `Available ${selectedAsset.displayAmount} ${selectedAsset.symbol}`
                  : undefined
              }
            />

            {currentMode === "agent_request" ? (
              <div className="rounded-md border border-border bg-background p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Linked signer agent
                </p>
                {linkedAgent ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={
                        linkedAgent.scopes.includes("wallet:transfer")
                          ? "success"
                          : "warning"
                      }
                    >
                      {linkedAgent.scopes.includes("wallet:transfer")
                        ? "transfer scope"
                        : "scope missing"}
                    </StatusBadge>
                    <StatusBadge
                      tone={linkedAgentHasTransferGrant ? "success" : "warning"}
                    >
                      {linkedAgentHasTransferGrant
                        ? "wallet grant"
                        : "grant missing"}
                    </StatusBadge>
                    <span className="font-mono text-xs text-foreground">
                      {linkedAgent.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatAddress(linkedAgent.id)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-warning">
                    This wallet is not linked to a signer agent.
                  </p>
                )}
              </div>
            ) : null}

            <Textarea
              label="Note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional internal note"
              maxLength={240}
            />
          </div>
        ) : null}

        {phase === "review" && draft ? (
          <div className="grid gap-4">
            <FieldGroup label="Summary">
              <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm">
                <ReviewRow
                  label="Source"
                  value={`${wallet.label ?? wallet.chain_name} (${formatAddress(
                    wallet.chain_address,
                  )})`}
                />
                <ReviewRow
                  label="Recipient"
                  value={formatAddress(draft.recipientAddress)}
                />
                <ReviewRow
                  label="Amount"
                  value={`${draft.amountUi} ${draft.asset.symbol}`}
                />
                <ReviewRow
                  label="Raw amount"
                  value={draft.rawAmount.toString()}
                  mono
                />
                <ReviewRow
                  label="Execution"
                  value={
                    draft.mode === "wallet_signed"
                      ? "Wallet signature"
                      : "Signer-agent request"
                  }
                />
                {draft.mode === "agent_request" && linkedAgent ? (
                  <ReviewRow label="Signer agent" value={linkedAgent.label} />
                ) : null}
                {transferDraft?.feeLamports != null ? (
                  <ReviewRow
                    label="Network fee"
                    value={`${formatRawAmount(
                      BigInt(transferDraft.feeLamports),
                      9,
                    )} SOL`}
                  />
                ) : null}
              </div>
            </FieldGroup>

            {draft.mode === "wallet_signed" ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  transferDraft
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-warning/30 bg-warning/10 text-warning",
                )}
              >
                {transferDraft ? (
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <span>
                  {transferDraft
                    ? "Preflight passed. The next click opens your wallet."
                    : "Run preflight before opening the wallet signature prompt."}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This creates a pending signer-agent request. The SDK execution
                  runner will bind and submit the on-chain dWallet transfer.
                </span>
              </div>
            )}
          </div>
        ) : null}

        {phase === "success" && draft ? (
          <div className="grid gap-4 rounded-md border border-success/30 bg-success/10 p-4 text-sm text-success">
            <div className="flex items-center gap-2">
              <Check className="size-4" aria-hidden />
              <span className="font-medium">
                {draft.mode === "wallet_signed"
                  ? "Transaction submitted"
                  : "Signer-agent request is pending"}
              </span>
            </div>
            <p className="break-all font-mono text-xs">
              {signature ?? requestId}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            onClick={phase === "form" ? onClose : resetToForm}
            disabled={busy}
          >
            {phase === "form" ? "Cancel" : "Back"}
          </Button>
          {phase === "form" ? (
            <Button type="button" onClick={handleReview} disabled={busy}>
              Review transfer
            </Button>
          ) : phase === "review" && draft?.mode === "wallet_signed" ? (
            transferDraft ? (
              <Button
                type="button"
                onClick={() => void handleWalletSend()}
                loading={busy}
                icon={<Send className="size-4" aria-hidden />}
              >
                Sign and send
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handlePreflight()}
                loading={busy}
                icon={<ShieldCheck className="size-4" aria-hidden />}
              >
                Run preflight
              </Button>
            )
          ) : phase === "review" ? (
            <Button
              type="button"
              onClick={() => void handleCreateRequest()}
              loading={busy}
            >
              Create request
            </Button>
          ) : (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}
