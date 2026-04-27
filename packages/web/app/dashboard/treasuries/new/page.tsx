"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import {
  buildCreateTreasuryArgs,
  sendWalletInstructions,
} from "@/lib/aura-app";
import { useAppSettings, useAuraClient } from "@/lib/hooks";

export default function CreateTreasuryPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [showSuccess, setShowSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [copiedPDA, setCopiedPDA] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [aiAuthority, setAiAuthority] = useState("");
  const [dailyLimit, setDailyLimit] = useState("95000");
  const [perTxLimit, setPerTxLimit] = useState("22000");
  const [daytimeHourly, setDaytimeHourly] = useState("9500");
  const [nighttimeHourly, setNighttimeHourly] = useState("4750");
  const [velocityLimit, setVelocityLimit] = useState("47500");
  const [maxSlippage, setMaxSlippage] = useState("100");
  const [maxQuoteAge, setMaxQuoteAge] = useState("300");
  const [ttlSecs, setTtlSecs] = useState("900");
  const [maxRiskScore, setMaxRiskScore] = useState("70");
  const [btcThreshold, setBtcThreshold] = useState("5000");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) {
        throw new Error("Connect a wallet first.");
      }
      const args = buildCreateTreasuryArgs({
        agentId: agentId,
        aiAuthority: aiAuthority.trim()
          ? new PublicKey(aiAuthority.trim())
          : wallet.publicKey,
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
      return { treasury: treasury.toBase58(), signature };
    },
    onSuccess: async (_data) => {
      setShowSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey) {
      return;
    }

    const errors: Record<string, string> = {};
    if (!agentId.trim()) errors.agentId = "Agent ID is required";

    if (aiAuthority && aiAuthority.trim().length > 0) {
      try {
        new PublicKey(aiAuthority);
      } catch (_err) {
        errors.aiAuthority = "Invalid Solana Public Key";
      }
    }

    if (!dailyLimit || Number(dailyLimit) <= 0)
      errors.dailyLimit = "Must be greater than 0";
    if (!perTxLimit || Number(perTxLimit) <= 0)
      errors.perTxLimit = "Must be greater than 0";
    if (!daytimeHourly || Number(daytimeHourly) <= 0)
      errors.daytimeHourly = "Must be greater than 0";
    if (!nighttimeHourly || Number(nighttimeHourly) <= 0)
      errors.nighttimeHourly = "Must be greater than 0";
    if (!velocityLimit || Number(velocityLimit) <= 0)
      errors.velocityLimit = "Must be greater than 0";
    if (!maxSlippage || Number(maxSlippage) <= 0)
      errors.maxSlippage = "Must be greater than 0";
    if (!maxQuoteAge || Number(maxQuoteAge) <= 0)
      errors.maxQuoteAge = "Must be greater than 0";
    if (!ttlSecs || Number(ttlSecs) <= 0)
      errors.ttlSecs = "Must be greater than 0";
    if (!maxRiskScore || Number(maxRiskScore) < 0 || Number(maxRiskScore) > 100)
      errors.maxRiskScore = "Must be between 0 and 100";
    if (!btcThreshold || Number(btcThreshold) <= 0)
      errors.btcThreshold = "Must be greater than 0";

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    createMutation.mutate();
  };

  const handleCopyPDA = async () => {
    if (createMutation.data) {
      await navigator.clipboard.writeText(createMutation.data.treasury);
      setCopiedPDA(true);
      setTimeout(() => setCopiedPDA(false), 2000);
    }
  };

  const handleCopyTx = async () => {
    if (createMutation.data) {
      await navigator.clipboard.writeText(createMutation.data.signature);
      setCopiedTx(true);
      setTimeout(() => setCopiedTx(false), 2000);
    }
  };

  const handleOpenExplorer = (type: "address" | "tx") => {
    if (!createMutation.data) return;
    const value =
      type === "address"
        ? createMutation.data.treasury
        : createMutation.data.signature;
    const path = type === "address" ? "address" : "tx";
    window.open(
      `https://explorer.solana.com/${path}/${value}?cluster=${settings.network}`,
      "_blank",
    );
  };

  const resetForm = () => {
    setAgentId("");
    setAiAuthority("");
    setDailyLimit("95000");
    setPerTxLimit("22000");
    setDaytimeHourly("9500");
    setNighttimeHourly("4750");
    setVelocityLimit("47500");
    setMaxSlippage("100");
    setMaxQuoteAge("300");
    setTtlSecs("900");
    setMaxRiskScore("70");
    setBtcThreshold("5000");
    setShowSuccess(false);
    setCopiedPDA(false);
    setCopiedTx(false);
    createMutation.reset();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-(--text-muted) hover:text-(--text-main) transition-colors text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Back arrow"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Treasuries
        </button>
      </nav>

      {/* Header */}
      <header className="mb-10">
        <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
          CREATE TREASURY
        </span>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
          Provision a new agent treasury.
        </h1>
        <p className="text-(--text-muted) font-light">
          Submit the actual create_treasury instruction against{" "}
          <span className="mono text-(--text-main)">{settings.network}</span>.
        </p>
      </header>

      {/* Form Section */}
      {!showSuccess && (
        <div className="mb-8">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-(--text-main) mb-1">
              Treasury Form
            </h2>
            <p className="text-sm text-(--text-muted)">
              Configure the initial parameters for your new treasury account.
            </p>
          </div>

          {createMutation.error && (
            <Alert
              variant="error"
              message={
                createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create treasury"
              }
              onClose={() => createMutation.reset()}
              className="mb-8"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-10" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              {/* Left Column */}
              <div className="space-y-8">
                <Input
                  label="Agent ID"
                  type="text"
                  value={agentId}
                  onChange={(e) => {
                    setAgentId(e.target.value);
                    if (validationErrors.agentId)
                      setValidationErrors((p) => ({ ...p, agentId: "" }));
                  }}
                  placeholder="e.g., SENTINEL-ALPHA-01"
                  required
                  disabled={createMutation.isPending}
                  error={validationErrors.agentId}
                />

                <Input
                  label="AI Authority Pubkey"
                  type="text"
                  value={aiAuthority}
                  onChange={(e) => {
                    setAiAuthority(e.target.value);
                    if (validationErrors.aiAuthority)
                      setValidationErrors((p) => ({ ...p, aiAuthority: "" }));
                  }}
                  placeholder={
                    `${wallet.publicKey?.toBase58().slice(0, 8)}...` ||
                    "0x7B2...E92"
                  }
                  disabled={createMutation.isPending}
                  error={validationErrors.aiAuthority}
                />

                <div>
                  <Input
                    label="Daily Limit (USD cents)"
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => {
                      setDailyLimit(e.target.value);
                      if (validationErrors.dailyLimit)
                        setValidationErrors((p) => ({ ...p, dailyLimit: "" }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.dailyLimit}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(dailyLimit) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <Input
                    label="Per-Tx Limit (USD cents)"
                    type="number"
                    value={perTxLimit}
                    onChange={(e) => {
                      setPerTxLimit(e.target.value);
                      if (validationErrors.perTxLimit)
                        setValidationErrors((p) => ({ ...p, perTxLimit: "" }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.perTxLimit}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(perTxLimit) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <Input
                    label="Daytime Hourly Limit"
                    type="number"
                    value={daytimeHourly}
                    onChange={(e) => {
                      setDaytimeHourly(e.target.value);
                      if (validationErrors.daytimeHourly)
                        setValidationErrors((p) => ({
                          ...p,
                          daytimeHourly: "",
                        }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.daytimeHourly}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(daytimeHourly) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <Input
                    label="Nighttime Hourly Limit"
                    type="number"
                    value={nighttimeHourly}
                    onChange={(e) => {
                      setNighttimeHourly(e.target.value);
                      if (validationErrors.nighttimeHourly)
                        setValidationErrors((p) => ({
                          ...p,
                          nighttimeHourly: "",
                        }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.nighttimeHourly}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(nighttimeHourly) / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <div>
                  <Input
                    label="Velocity Limit"
                    type="number"
                    value={velocityLimit}
                    onChange={(e) => {
                      setVelocityLimit(e.target.value);
                      if (validationErrors.velocityLimit)
                        setValidationErrors((p) => ({
                          ...p,
                          velocityLimit: "",
                        }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.velocityLimit}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(velocityLimit) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <Input
                    label="Max Slippage BPS"
                    type="number"
                    value={maxSlippage}
                    onChange={(e) => {
                      setMaxSlippage(e.target.value);
                      if (validationErrors.maxSlippage)
                        setValidationErrors((p) => ({ ...p, maxSlippage: "" }));
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
                    label="Max Quote Age Secs"
                    type="number"
                    value={maxQuoteAge}
                    onChange={(e) => {
                      setMaxQuoteAge(e.target.value);
                      if (validationErrors.maxQuoteAge)
                        setValidationErrors((p) => ({ ...p, maxQuoteAge: "" }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.maxQuoteAge}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    {Math.floor(Number(maxQuoteAge) / 60)} minutes
                  </p>
                </div>

                <div>
                  <Input
                    label="TTL Secs"
                    type="number"
                    value={ttlSecs}
                    onChange={(e) => {
                      setTtlSecs(e.target.value);
                      if (validationErrors.ttlSecs)
                        setValidationErrors((p) => ({ ...p, ttlSecs: "" }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.ttlSecs}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    {Math.floor(Number(ttlSecs) / 60)} minutes
                  </p>
                </div>

                <div>
                  <Input
                    label="Max Risk Score"
                    type="number"
                    value={maxRiskScore}
                    onChange={(e) => {
                      setMaxRiskScore(e.target.value);
                      if (validationErrors.maxRiskScore)
                        setValidationErrors((p) => ({
                          ...p,
                          maxRiskScore: "",
                        }));
                    }}
                    min="0"
                    max="100"
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.maxRiskScore}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    0-100 scale
                  </p>
                </div>

                <div>
                  <Input
                    label="BTC Manual Review Threshold"
                    type="number"
                    value={btcThreshold}
                    onChange={(e) => {
                      setBtcThreshold(e.target.value);
                      if (validationErrors.btcThreshold)
                        setValidationErrors((p) => ({
                          ...p,
                          btcThreshold: "",
                        }));
                    }}
                    required
                    disabled={createMutation.isPending}
                    error={validationErrors.btcThreshold}
                  />
                  <p className="text-[11px] text-(--text-muted) mt-1">
                    ${(Number(btcThreshold) / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <Button
                type="submit"
                variant="primary"
                size="medium"
                loading={createMutation.isPending}
                disabled={createMutation.isPending}
                className="px-12"
              >
                Create Treasury
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Success Section */}
      {showSuccess && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-(--text-main) mb-1">
                Treasury created on-chain
              </h3>
              <p className="text-sm text-(--text-muted)">
                Account successfully initialized and funded for rent.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* PDA Address */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded">
              <span className="mono text-[9px] uppercase text-(--text-muted) mb-2 block tracking-wider">
                PDA Address
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="mono text-[13px] text-emerald-500 break-all leading-relaxed">
                  {createMutation.data?.treasury}
                </code>
                <button
                  type="button"
                  onClick={handleCopyPDA}
                  className="text-(--text-muted) hover:text-(--text-main) transition-colors shrink-0 ml-2"
                  title="Copy address"
                >
                  {copiedPDA ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Transaction Signature */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded">
              <span className="mono text-[9px] uppercase text-(--text-muted) mb-2 block tracking-wider">
                Transaction Signature
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="mono text-[13px] text-emerald-500 break-all leading-relaxed">
                  {createMutation.data?.signature}
                </code>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={handleCopyTx}
                    className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                    title="Copy signature"
                  >
                    {copiedTx ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenExplorer("tx")}
                    className="text-(--text-muted) hover:text-(--text-main) transition-colors"
                    title="Open in explorer"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      role="img"
                      aria-label="External link"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              type="button"
              variant="ghost"
              size="medium"
              onClick={() =>
                router.push(
                  `/dashboard/treasuries/${createMutation.data?.treasury}`,
                )
              }
              className="px-6 bg-transparent border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-500"
            >
              Open Detail Page
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="medium"
              onClick={resetForm}
              className="px-6"
            >
              Create Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
