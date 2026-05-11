"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { UsdInput } from "@/components/global/UsdInput";
import { Check, Copy, Eraser, ExternalLink, Vault } from "@/components/icons";
import {
  buildCreateTreasuryArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";

// default form values

const DEFAULTS = {
  dailyLimit: "10000", // $100/day
  perTxLimit: "2500", // $25/tx
  daytimeHourly: "5000", // $50/hr daytime
  nighttimeHourly: "2000", // $20/hr nighttime
  velocityLimit: "7500", // $75 velocity window
  maxSlippage: "50", // 0.5%
  maxQuoteAge: "120", // 2 minutes
  ttlSecs: "300", // 5 minutes
  maxRiskScore: "50", // tighter risk threshold
  btcThreshold: "1000", // $10 BTC manual review
};

// component

interface CreateTreasuryModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTreasuryModal({
  open,
  onClose,
}: CreateTreasuryModalProps) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const { push } = useRouter();
  const queryClient = useQueryClient();

  const {
    agents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    isLoading: agentsLoading,
  } = useAgents();

  // form state
  const [treasuryName, setTreasuryName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(DEFAULTS.dailyLimit);
  const [perTxLimit, setPerTxLimit] = useState(DEFAULTS.perTxLimit);
  const [daytimeHourly, setDaytimeHourly] = useState(DEFAULTS.daytimeHourly);
  const [nighttimeHourly, setNighttimeHourly] = useState(
    DEFAULTS.nighttimeHourly,
  );
  const [velocityLimit, setVelocityLimit] = useState(DEFAULTS.velocityLimit);
  const [maxSlippage, setMaxSlippage] = useState(DEFAULTS.maxSlippage);
  const [maxQuoteAge, setMaxQuoteAge] = useState(DEFAULTS.maxQuoteAge);
  const [ttlSecs, setTtlSecs] = useState(DEFAULTS.ttlSecs);
  const [maxRiskScore, setMaxRiskScore] = useState(DEFAULTS.maxRiskScore);
  const [btcThreshold, setBtcThreshold] = useState(DEFAULTS.btcThreshold);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [copiedPDA, setCopiedPDA] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
      if (!selectedAgent)
        throw new Error(
          "Create and select an agent before creating a treasury.",
        );

      const args = buildCreateTreasuryArgs({
        agentId: treasuryName.trim(),
        aiAuthority: new PublicKey(selectedAgent.publicKey),
        dailyLimitUsd: Number(dailyLimit),
        perTxLimitUsd: Number(perTxLimit),
        daytimeHourlyLimitUsd: Number(daytimeHourly),
        nighttimeHourlyLimitUsd: Number(nighttimeHourly),
        velocityLimitUsd: Number(velocityLimit),
        maxSlippageBps: Number(maxSlippage),
        maxQuoteAgeSecs: Number(maxQuoteAge),
        pendingTransactionTtlSecs: Number(ttlSecs),
        maxCounterpartyRiskScore: Number(maxRiskScore),
        bitcoinManualReviewThresholdUsd: Number(btcThreshold),
      });

      const { treasury, instruction } = await client.createTreasuryInstruction({
        owner: wallet.publicKey,
        args,
      });
      const signature = await sendWalletInstructions(connection, wallet, [
        instruction,
      ]);

      // Register with backend — fire-and-forget, non-fatal
      postBackend(settings.backendUrl, "/v1/treasuries/register", {
        treasuryAddress: treasury.toBase58(),
        agentId: treasuryName.trim(),
        txSignature: signature,
        ownerWallet: wallet.publicKey.toBase58(),
        agentPublicKey: selectedAgent.publicKey,
      }).catch(() => {});

      return { treasury: treasury.toBase58(), signature };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  // reset everything when modal closes
  useEffect(() => {
    if (!open) {
      setTreasuryName("");
      setDailyLimit(DEFAULTS.dailyLimit);
      setPerTxLimit(DEFAULTS.perTxLimit);
      setDaytimeHourly(DEFAULTS.daytimeHourly);
      setNighttimeHourly(DEFAULTS.nighttimeHourly);
      setVelocityLimit(DEFAULTS.velocityLimit);
      setMaxSlippage(DEFAULTS.maxSlippage);
      setMaxQuoteAge(DEFAULTS.maxQuoteAge);
      setTtlSecs(DEFAULTS.ttlSecs);
      setMaxRiskScore(DEFAULTS.maxRiskScore);
      setBtcThreshold(DEFAULTS.btcThreshold);
      setValidationErrors({});
      setCopiedPDA(false);
      setCopiedTx(false);
      createMutation.reset();
    }
  }, [open, createMutation.reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (!treasuryName.trim()) {
      errors.treasuryName = "Treasury name is required.";
    } else if (new TextEncoder().encode(treasuryName.trim()).length > 64) {
      errors.treasuryName = "Must be 64 characters or fewer.";
    }
    if (!selectedAgent) {
      errors.agent = "Create and select an agent first.";
    } else {
      try {
        new PublicKey(selectedAgent.publicKey);
      } catch {
        errors.agent = "Selected agent public key is invalid.";
      }
    }
    if (!dailyLimit || Number(dailyLimit) <= 0)
      errors.dailyLimit = "Must be > 0";
    if (!perTxLimit || Number(perTxLimit) <= 0)
      errors.perTxLimit = "Must be > 0";
    if (!daytimeHourly || Number(daytimeHourly) <= 0)
      errors.daytimeHourly = "Must be > 0";
    if (!nighttimeHourly || Number(nighttimeHourly) <= 0)
      errors.nighttimeHourly = "Must be > 0";
    if (!velocityLimit || Number(velocityLimit) <= 0)
      errors.velocityLimit = "Must be > 0";
    if (!maxSlippage || Number(maxSlippage) <= 0)
      errors.maxSlippage = "Must be > 0";
    if (!maxQuoteAge || Number(maxQuoteAge) <= 0)
      errors.maxQuoteAge = "Must be > 0";
    if (!ttlSecs || Number(ttlSecs) <= 0) errors.ttlSecs = "Must be > 0";
    if (!maxRiskScore || Number(maxRiskScore) < 0 || Number(maxRiskScore) > 100)
      errors.maxRiskScore = "Must be 0–100";
    if (!btcThreshold || Number(btcThreshold) <= 0)
      errors.btcThreshold = "Must be > 0";

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    createMutation.mutate();
  };

  const clearError = (key: string) =>
    setValidationErrors((p) => ({ ...p, [key]: "" }));

  const clearForm = () => {
    setDailyLimit("0");
    setPerTxLimit("0");
    setDaytimeHourly("0");
    setNighttimeHourly("0");
    setVelocityLimit("0");
    setMaxSlippage("0");
    setMaxQuoteAge("0");
    setTtlSecs("0");
    setMaxRiskScore("0");
    setBtcThreshold("0");
    setValidationErrors({});
  };

  const handleCopy = async (text: string, which: "pda" | "tx") => {
    await navigator.clipboard.writeText(text);
    if (which === "pda") {
      setCopiedPDA(true);
      setTimeout(() => setCopiedPDA(false), 2000);
    } else {
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  const succeeded = createMutation.isSuccess && !!createMutation.data;
  const successData = createMutation.data;

  // Single modal with animated form → success transition
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      className={succeeded ? "max-w-lg" : "max-w-2xl"}
      footer={
        succeeded ? (
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button
              variant="secondary"
              size="medium"
              className="flex-1"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="medium"
              className="flex-1"
              onClick={() => {
                onClose();
                push(`/dashboard/treasuries/${successData?.treasury}`);
              }}
            >
              Open Treasury
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            {createMutation.error && (
              <Alert
                variant="error"
                message={
                  createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "Failed to create treasury"
                }
                onClose={() => createMutation.reset()}
              />
            )}
            <div className="flex gap-2 w-full">
              <Button
                variant="secondary"
                size="medium"
                className="flex-1"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-treasury-form"
                variant="primary"
                size="medium"
                className="flex-1"
                loading={createMutation.isPending}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create Treasury"}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {succeeded ? (
            <m.div
              key="success"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="flex flex-col items-center text-center mb-6">
                {/* // Fix: scale-from-zero, use scale: 0.95 instead of scale: 0 */}
                <m.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: 0.1,
                    duration: 0.4,
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                  }}
                  className="flex size-14 items-center justify-center rounded-full border border-success/30 bg-success/10 mb-4"
                >
                  <m.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.25, duration: 0.25, type: "spring" }}
                  >
                    <Check
                      className="size-6 text-success"
                      animateOnHover
                      strokeWidth={2.5}
                    />
                  </m.div>
                </m.div>
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  <h3 className="text-lg font-semibold text-(--text-main) tracking-tight">
                    Treasury created on-chain
                  </h3>
                  <p className="mt-1 text-xs text-(--text-muted)">
                    Account initialized on{" "}
                    <span className="mono text-(--text-main)">
                      {settings.network}
                    </span>
                    .
                  </p>
                </m.div>
              </div>
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="space-y-3"
              >
                <div className="rounded-sm border border-border bg-(--card-content) p-3">
                  <p className="mono text-[9px] uppercase tracking-widest text-(--text-muted) mb-1.5">
                    PDA Address
                  </p>
                  <p className="mono text-[11px] text-success break-all leading-relaxed">
                    {successData?.treasury}
                    <button
                      type="button"
                      title={copiedPDA ? "Copied!" : "Copy"}
                      onClick={() =>
                        handleCopy(successData?.treasury ?? "", "pda")
                      }
                      className="inline-flex align-middle ml-1.5 text-(--text-muted) hover:text-(--text-main) transition-colors"
                      aria-label="Copy PDA"
                    >
                      {copiedPDA ? (
                        <Check className="size-3 text-success" animateOnHover />
                      ) : (
                        <Copy className="size-3" animateOnHover />
                      )}
                    </button>
                  </p>
                </div>
                <div className="rounded-sm border border-border bg-(--card-content) p-3">
                  <p className="mono text-[9px] uppercase tracking-widest text-(--text-muted) mb-1.5">
                    Transaction Signature
                  </p>
                  <p className="mono text-[11px] text-success break-all leading-relaxed">
                    {successData?.signature}
                    <button
                      type="button"
                      title={copiedTx ? "Copied!" : "Copy"}
                      onClick={() =>
                        handleCopy(successData?.signature ?? "", "tx")
                      }
                      className="inline-flex align-middle ml-1.5 text-(--text-muted) hover:text-(--text-main) transition-colors"
                      aria-label="Copy signature"
                    >
                      {copiedTx ? (
                        <Check className="size-3 text-success" animateOnHover />
                      ) : (
                        <Copy className="size-3" animateOnHover />
                      )}
                    </button>
                    <button
                      type="button"
                      title="View on Explorer"
                      onClick={() =>
                        window.open(
                          `https://explorer.solana.com/tx/${successData?.signature}?cluster=${settings.network}`,
                          "_blank",
                        )
                      }
                      className="inline-flex align-middle ml-1 text-(--text-muted) hover:text-(--text-main) transition-colors"
                      aria-label="View on explorer"
                    >
                      <ExternalLink className="size-3" animateOnHover />
                    </button>
                  </p>
                </div>
              </m.div>
            </m.div>
          ) : (
            <m.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-(--hover-bg)">
                  <Vault
                    className="size-4.5 text-(--text-main)"
                    animateOnHover
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-(--text-main) tracking-tight">
                    New Treasury
                  </h3>
                  <p className="text-xs text-(--text-muted)">
                    Submits{" "}
                    <code className="mono text-[10px] text-(--text-main)">
                      create_treasury
                    </code>{" "}
                    on{" "}
                    <span className="mono text-(--text-main)">
                      {settings.network}
                    </span>
                  </p>
                </div>
              </div>
              <form
                id="create-treasury-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="treasury-name"
                      className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold"
                    >
                      Treasury Name
                    </label>
                    <input
                      id="treasury-name"
                      type="text"
                      value={treasuryName}
                      onChange={(e) => {
                        setTreasuryName(e.target.value);
                        clearError("treasuryName");
                      }}
                      placeholder="e.g. trading-bot-1"
                      disabled={createMutation.isPending}
                      className="bg-(--input-bg) border border-border rounded-sm p-3 text-sm outline-none w-full transition-colors text-(--text-main) focus:border-(--text-muted) placeholder:text-(--text-muted) disabled:opacity-50"
                    />
                    <p className="text-[11px] text-(--text-muted)">
                      Unique name, used as the on-chain PDA seed. Any
                      characters, up to 64 bytes.
                    </p>
                    {validationErrors.treasuryName && (
                      <p className="text-xs text-danger">
                        {validationErrors.treasuryName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold">
                      Signing Agent
                    </p>
                    <Dropdown
                      options={agents.map((a) => ({
                        value: a.agentId,
                        label: a.label || a.agentId,
                        badge:
                          a.agentId === selectedAgentId ? "Active" : undefined,
                      }))}
                      value={selectedAgentId}
                      onChange={(v) => {
                        setSelectedAgentId(v);
                        clearError("agent");
                      }}
                      placeholder={
                        agentsLoading ? "Loading agents…" : "Select agent"
                      }
                    />
                    {validationErrors.agent && (
                      <p className="text-xs text-danger">
                        {validationErrors.agent}
                      </p>
                    )}
                    {agents.length === 0 && !agentsLoading && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          push("/dashboard/signers");
                        }}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Create an agent first →
                      </button>
                    )}
                  </div>
                  {selectedAgent && (
                    <div className="rounded-sm border border-border/60 bg-(--card-content) px-3 py-2">
                      <p className="mono text-[9px] uppercase tracking-widest text-(--text-muted) mb-1">
                        ai_authority
                      </p>
                      <p className="mono text-[11px] text-(--text-main) break-all">
                        {selectedAgent.publicKey}
                      </p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold">
                        Spending Limits
                      </p>
                      <button
                        type="button"
                        onClick={clearForm}
                        disabled={createMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-sm border border-border bg-(--hover-bg) px-2 py-0.5 mono text-[9px] uppercase tracking-widest text-(--text-muted) transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Eraser className="size-2.5" animateOnHover />
                        Clear
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <UsdInput
                        label="Daily Limit"
                        valueCents={dailyLimit}
                        onChangeCents={(v) => {
                          setDailyLimit(v);
                          clearError("dailyLimit");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.dailyLimit}
                      />
                      <UsdInput
                        label="Per-Tx Limit"
                        valueCents={perTxLimit}
                        onChangeCents={(v) => {
                          setPerTxLimit(v);
                          clearError("perTxLimit");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.perTxLimit}
                      />
                      <UsdInput
                        label="Daytime Hourly"
                        valueCents={daytimeHourly}
                        onChangeCents={(v) => {
                          setDaytimeHourly(v);
                          clearError("daytimeHourly");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.daytimeHourly}
                      />
                      <UsdInput
                        label="Nighttime Hourly"
                        valueCents={nighttimeHourly}
                        onChangeCents={(v) => {
                          setNighttimeHourly(v);
                          clearError("nighttimeHourly");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.nighttimeHourly}
                      />
                      <UsdInput
                        label="Velocity Limit"
                        valueCents={velocityLimit}
                        onChangeCents={(v) => {
                          setVelocityLimit(v);
                          clearError("velocityLimit");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.velocityLimit}
                      />
                      <UsdInput
                        label="BTC Manual Review Threshold"
                        valueCents={btcThreshold}
                        onChangeCents={(v) => {
                          setBtcThreshold(v);
                          clearError("btcThreshold");
                        }}
                        required
                        disabled={createMutation.isPending}
                        error={validationErrors.btcThreshold}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted) font-bold mb-3">
                      Risk & Timing
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Input
                          label="Max Slippage BPS"
                          type="number"
                          value={maxSlippage}
                          onChange={(e) => {
                            setMaxSlippage(e.target.value);
                            clearError("maxSlippage");
                          }}
                          required
                          disabled={createMutation.isPending}
                          error={validationErrors.maxSlippage}
                        />
                        <p className="text-[11px] text-(--text-muted) mt-1">
                          {(Number(maxSlippage) / 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <Input
                          label="Max Quote Age (secs)"
                          type="number"
                          value={maxQuoteAge}
                          onChange={(e) => {
                            setMaxQuoteAge(e.target.value);
                            clearError("maxQuoteAge");
                          }}
                          required
                          disabled={createMutation.isPending}
                          error={validationErrors.maxQuoteAge}
                        />
                        <p className="text-[11px] text-(--text-muted) mt-1">
                          {Math.floor(Number(maxQuoteAge) / 60)} min
                        </p>
                      </div>
                      <div>
                        <Input
                          label="Proposal TTL (secs)"
                          type="number"
                          value={ttlSecs}
                          onChange={(e) => {
                            setTtlSecs(e.target.value);
                            clearError("ttlSecs");
                          }}
                          required
                          disabled={createMutation.isPending}
                          error={validationErrors.ttlSecs}
                        />
                        <p className="text-[11px] text-(--text-muted) mt-1">
                          {Math.floor(Number(ttlSecs) / 60)} min
                        </p>
                      </div>
                      <div>
                        <Input
                          label="Max Risk Score"
                          type="number"
                          value={maxRiskScore}
                          onChange={(e) => {
                            setMaxRiskScore(e.target.value);
                            clearError("maxRiskScore");
                          }}
                          min="0"
                          max="100"
                          required
                          disabled={createMutation.isPending}
                          error={validationErrors.maxRiskScore}
                        />
                        <p className="text-[11px] text-(--text-muted) mt-1">
                          0–100 scale
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
