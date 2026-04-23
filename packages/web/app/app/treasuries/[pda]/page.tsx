"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SpendingBarChart } from "@/components/app/charts";
import { PageHeader, StatCard, StatusPill, Surface } from "@/components/app/ui";
import {
  buildRegisterDwalletArgs,
  formatChain,
  formatProposalStatus,
  formatTxType,
  formatViolation,
  parsePublicKey,
  sendWalletInstructions,
} from "@/lib/aura-app";
import {
  useAppSettings,
  useAuraClient,
  useRecentActivity,
  useTreasury,
} from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

export default function TreasuryDetailPage() {
  const params = useParams<{ pda: string }>();
  const pda = params.pda;
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const treasuryQuery = useTreasury(pda);
  const entry = treasuryQuery.data;
  const account = entry?.account;
  const activityQuery = useRecentActivity(entry ? [entry] : []);
  const activity = activityQuery.data ?? [];

  const [dwalletForm, setDwalletForm] = useState({
    chain: "2",
    dwalletId: "",
    address: "",
    balanceUsd: "0",
    dwalletAccount: "",
    authorizedUserPubkey: "",
    messageMetadataDigest: "",
    publicKeyHex: "",
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const instruction = await client.pauseExecutionInstruction(
        { owner: wallet.publicKey, treasury: entry.publicKey },
        !entry.account.executionPaused,
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const instruction = await client.cancelPendingInstruction(
        { owner: wallet.publicKey, treasury: entry.publicKey },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey || !entry) {
        throw new Error("Connect a wallet first.");
      }
      const args = buildRegisterDwalletArgs({
        chain: Number(dwalletForm.chain),
        dwalletId: dwalletForm.dwalletId,
        address: dwalletForm.address,
        balanceUsd: Number(dwalletForm.balanceUsd),
        dwalletAccount: dwalletForm.dwalletAccount
          ? parsePublicKey(dwalletForm.dwalletAccount)
          : null,
        authorizedUserPubkey: dwalletForm.authorizedUserPubkey
          ? parsePublicKey(dwalletForm.authorizedUserPubkey)
          : null,
        messageMetadataDigest: dwalletForm.messageMetadataDigest || null,
        publicKeyHex: dwalletForm.publicKeyHex || null,
      });
      const instruction = await client.registerDwalletInstruction(
        { owner: wallet.publicKey, treasury: entry.publicKey },
        args,
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    },
  });

  const spendingSeries = useMemo(() => {
    if (!account) {
      return [];
    }
    const currentLimit = Number(account.policyConfig.dailyLimitUsd.toString());
    return account.policyState.recentAmounts.map((amount, index) => ({
      day: `Tx ${index + 1}`,
      spend: Number(amount.toString()),
      limit: currentLimit,
    }));
  }, [account]);

  if (!entry || !account) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Treasury Detail"
          title="Loading treasury"
          copy="Fetching the treasury account from chain."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury Detail"
        title={account.agentId}
        copy={`Live state for ${shortenAddress(entry.publicKey.toBase58(), 8, 8)} on ${settings.network}.`}
        action={
          <div className="flex flex-wrap gap-3">
            <StatusPill
              status={account.executionPaused ? "Paused" : "Active"}
            />
            <button
              type="button"
              className="button-secondary"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              {account.executionPaused ? "Unpause" : "Pause"} Treasury
            </button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Daily Limit"
          value={formatCurrency(
            Number(account.policyConfig.dailyLimitUsd.toString()),
          )}
          helper="Policy config"
        />
        <StatCard
          label="Per-tx Limit"
          value={formatCurrency(
            Number(account.policyConfig.perTxLimitUsd.toString()),
          )}
          helper="Policy config"
        />
        <StatCard
          label="Total Transactions"
          value={account.totalTransactions.toString()}
          helper="On-chain counter"
        />
        <StatCard
          label="Reputation Volume"
          value={formatCurrency(
            Number(account.reputation.totalVolumeUsd.toString()),
          )}
          helper={`${account.reputation.successfulTransactions.toString()} successful`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface
          title="Spending Progress"
          copy="Derived from policy state counters and recent amount history."
        >
          <div className="mb-6 rounded-[1.3rem] border border-white/8 bg-white/4 p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-400">Spent today</span>
              <span className="text-white">
                {formatCurrency(
                  Number(account.policyState.spentTodayUsd.toString()),
                )}{" "}
                /{" "}
                {formatCurrency(
                  Number(account.policyConfig.dailyLimitUsd.toString()),
                )}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/8">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300"
                style={{
                  width: `${Math.min(
                    100,
                    (Number(account.policyState.spentTodayUsd.toString()) /
                      Math.max(
                        1,
                        Number(account.policyConfig.dailyLimitUsd.toString()),
                      )) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
          <SpendingBarChart data={spendingSeries} />
        </Surface>

        <Surface
          title="Action Buttons"
          copy="These actions submit real program instructions."
        >
          <div className="grid gap-3">
            <Link
              href={`/app/treasuries/${entry.publicKey.toBase58()}/propose`}
              className="button-secondary justify-between"
            >
              Propose Transaction
            </Link>
            <Link
              href={`/app/treasuries/${entry.publicKey.toBase58()}/confidential`}
              className="button-secondary justify-between"
            >
              Configure Confidential Guardrails
            </Link>
            <Link
              href={`/app/treasuries/${entry.publicKey.toBase58()}/governance`}
              className="button-secondary justify-between"
            >
              Configure Governance
            </Link>
            <button
              type="button"
              className="button-secondary justify-between"
              onClick={() => cancelMutation.mutate()}
              disabled={!account.pending || cancelMutation.isPending}
            >
              Cancel Pending
            </button>
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface
          title="Policy Config"
          copy="Directly decoded from the treasury account."
        >
          <div className="grid gap-3">
            {[
              [
                "Daily limit",
                formatCurrency(
                  Number(account.policyConfig.dailyLimitUsd.toString()),
                ),
              ],
              [
                "Per-tx limit",
                formatCurrency(
                  Number(account.policyConfig.perTxLimitUsd.toString()),
                ),
              ],
              [
                "Daytime hourly",
                formatCurrency(
                  Number(account.policyConfig.daytimeHourlyLimitUsd.toString()),
                ),
              ],
              [
                "Nighttime hourly",
                formatCurrency(
                  Number(
                    account.policyConfig.nighttimeHourlyLimitUsd.toString(),
                  ),
                ),
              ],
              [
                "Velocity limit",
                formatCurrency(
                  Number(account.policyConfig.velocityLimitUsd.toString()),
                ),
              ],
              [
                "Max slippage",
                `${account.policyConfig.maxSlippageBps.toString()} bps`,
              ],
              [
                "Max quote age",
                `${account.policyConfig.maxQuoteAgeSecs?.toString() ?? "none"} sec`,
              ],
              [
                "Max risk score",
                `${account.policyConfig.maxCounterpartyRiskScore ?? "none"}`,
              ],
              [
                "Shared pool",
                account.policyConfig.sharedPoolLimitUsd
                  ? formatCurrency(
                      Number(
                        account.policyConfig.sharedPoolLimitUsd.toString(),
                      ),
                    )
                  : "Not set",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3"
              >
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        </Surface>

        <Surface
          title="dWallets"
          copy="Registered from on-chain dWallet records."
        >
          <div className="grid gap-3">
            {account.dwallets.length === 0 ? (
              <p className="text-sm text-slate-400">
                No dWallets registered yet.
              </p>
            ) : (
              account.dwallets.map((dwallet) => (
                <div
                  key={`${dwallet.chain}-${dwallet.dwalletId}`}
                  className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">
                        {formatChain(dwallet.chain)}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {dwallet.address}
                      </p>
                    </div>
                    <StatusPill
                      status={dwallet.dwalletAccount ? "Active" : "Pending"}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    Balance{" "}
                    {formatCurrency(Number(dwallet.balanceUsd.toString()))}
                  </p>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>

      <Surface
        title="Register dWallet"
        copy="Submit a real register_dwallet transaction."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Chain code", "chain"],
            ["dWallet ID", "dwalletId"],
            ["Address", "address"],
            ["Balance USD cents", "balanceUsd"],
            ["Runtime dWallet account", "dwalletAccount"],
            ["Authorized user pubkey", "authorizedUserPubkey"],
            ["Message metadata digest", "messageMetadataDigest"],
            ["Public key hex", "publicKeyHex"],
          ].map(([label, key]) => (
            <label
              key={key}
              className={key === "address" ? "md:col-span-2" : ""}
            >
              <span className="field-label">{label}</span>
              <input
                className="input"
                value={dwalletForm[key as keyof typeof dwalletForm]}
                onChange={(event) =>
                  setDwalletForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="button-primary"
            onClick={() => registerMutation.mutate()}
            disabled={registerMutation.isPending}
          >
            Register dWallet
          </button>
          {registerMutation.error ? (
            <p className="text-sm text-rose-300">
              {registerMutation.error instanceof Error
                ? registerMutation.error.message
                : "Registration failed"}
            </p>
          ) : null}
        </div>
      </Surface>

      <div className="grid gap-6 xl:grid-cols-2">
        <Surface
          title="Pending Proposal"
          copy="Current pending proposal decoded from the treasury account."
        >
          {account.pending ? (
            <div className="space-y-4">
              <div className="rounded-[1.3rem] border border-amber-400/16 bg-amber-400/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-white">
                    Proposal #{account.pending.proposalId.toString()}
                  </p>
                  <StatusPill status="Pending" />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {formatCurrency(Number(account.pending.amountUsd.toString()))}{" "}
                  on {formatChain(account.pending.targetChain)} as{" "}
                  {formatTxType(account.pending.txType)} to{" "}
                  {account.pending.recipientOrContract}
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  Status {formatProposalStatus(account.pending.status)} •
                  Violation{" "}
                  {formatViolation(account.pending.decision.violation)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No active pending proposal.
            </p>
          )}
        </Surface>

        <Surface
          title="Governance and Audit"
          copy="Live governance state plus recent audit events."
        >
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Multisig</p>
              <p className="mt-2">
                {account.multisig
                  ? `${account.multisig.requiredSignatures}-of-${account.multisig.guardians.length}`
                  : "Not configured"}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Swarm</p>
              <p className="mt-2">
                {account.swarm
                  ? `${account.swarm.swarmId} • ${account.swarm.memberAgents.join(", ")}`
                  : "Not configured"}
              </p>
            </div>
            {activity.slice(0, 5).map((item) => (
              <div
                key={item.signature}
                className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300"
              >
                {item.detail ?? `Proposal #${item.proposalId}`}
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
