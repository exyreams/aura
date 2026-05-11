"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Badge } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { Textarea } from "@/components/global/Textarea";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Checkcircle,
  Copy,
  FileText,
  Send,
  Shield,
  Wallet,
} from "@/components/icons";
import { SmartAccountInput } from "@/components/playground/SmartAccountInput";
import { deserializeInstruction, sendWalletInstructions } from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import {
  type InstructionBuildResponse,
  type InstructionCatalogResponse,
  type ProgramInstructionSchema,
  useAgents,
  useAppSettings,
  useBackendInfo,
} from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

type CatalogInstruction =
  InstructionCatalogResponse["domains"][number]["instructions"][number];

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

const _maturityStyles: Record<string, string> = {
  wallet: "border-primary/50 text-(--text-main) bg-(--hover-bg)",
  backend: "border-blue-400/30 text-blue-200 bg-blue-500/10",
  read_only: "border-zinc-400/30 text-zinc-300 bg-zinc-500/10",
  external_cpi: "border-amber-400/30 text-amber-200 bg-amber-500/10",
};

const maturityLabels: Record<string, string> = {
  wallet: "Wallet",
  backend: "Backend",
  read_only: "Read-only",
  external_cpi: "External CPI",
};

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function buildArgsSample(schema: ProgramInstructionSchema) {
  if (schema.args.length === 0) return {};
  if (
    schema.args.length === 1 &&
    schema.args[0]?.name === "args" &&
    schema.args[0].sample &&
    typeof schema.args[0].sample === "object" &&
    !Array.isArray(schema.args[0].sample)
  ) {
    return schema.args[0].sample;
  }
  return Object.fromEntries(schema.args.map((arg) => [arg.name, arg.sample]));
}

function buildDefaultAccounts(
  schema: ProgramInstructionSchema,
  walletAddress: string | undefined,
  programId: string | undefined,
) {
  return Object.fromEntries(
    schema.accounts.map((account) => {
      if (account.address) return [account.name, account.address];
      if (account.name === "system_program")
        return [account.name, SYSTEM_PROGRAM_ID];
      if (account.name === "caller_program" && programId)
        return [account.name, programId];
      if (account.signer && walletAddress) return [account.name, walletAddress];
      return [account.name, ""];
    }),
  );
}

function replaceWalletPlaceholders(
  value: unknown,
  walletAddress: string | undefined,
): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "$wallet" || trimmed === "$signer") {
      if (!walletAddress)
        throw new Error("Connect a wallet before using wallet placeholders.");
      return walletAddress;
    }
    return value;
  }
  if (Array.isArray(value))
    return value.map((e) => replaceWalletPlaceholders(e, walletAddress));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        replaceWalletPlaceholders(v, walletAddress),
      ]),
    );
  }
  return value;
}

function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // WalletSendTransactionError wraps simulation logs — surface them
  const logs = (error as Error & { logs?: string[] }).logs;
  if (logs && logs.length > 0) {
    const programError = logs.find(
      (l) => l.includes("Error") || l.includes("failed"),
    );
    if (programError) return `${error.message}\n\n${programError}`;
    return `${error.message}\n\nLogs:\n${logs.slice(-5).join("\n")}`;
  }
  return error.message;
}

export interface InstructionBuilderProps {
  found: {
    domain: InstructionCatalogResponse["domains"][number];
    instruction: CatalogInstruction;
  };
  schema: ProgramInstructionSchema;
}

export function InstructionBuilderSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-20" />
      <Skeleton className="h-10" />
      <Skeleton className="h-[360px]" />
      <Skeleton className="h-[160px]" />
    </div>
  );
}

export function InstructionBuilder({ found, schema }: InstructionBuilderProps) {
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const wallet = useWallet();
  const { connection } = useConnection();
  const backendInfoQuery = useBackendInfo();
  const queryClient = useQueryClient();

  const walletAddress = wallet.publicKey?.toBase58();
  const programId = settings.resolvedProgramId?.toBase58();

  const [accountValues, setAccountValues] = useState<Record<string, string>>(
    {},
  );
  const [argsText, setArgsText] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);
  const [buildResult, setBuildResult] =
    useState<InstructionBuildResponse | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setAccountValues(buildDefaultAccounts(schema, walletAddress, programId));
    setArgsText(safeJson(buildArgsSample(schema)));
    setBuildResult(null);
    setSignature(null);
    setFormError(null);
  }, [programId, schema, walletAddress]);

  const buildPayload = useCallback(() => {
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(argsText || "{}") as unknown;
    } catch {
      throw new Error("Arguments must be valid JSON.");
    }
    const accounts = Object.fromEntries(
      Object.entries(accountValues).map(([k, v]) => [k, v.trim()]),
    );
    return {
      instruction: schema.name,
      accounts: replaceWalletPlaceholders(accounts, walletAddress) as Record<
        string,
        unknown
      >,
      args: replaceWalletPlaceholders(parsedArgs, walletAddress) as
        | Record<string, unknown>
        | unknown[],
      rpcUrl: settings.endpoint,
      programId: programId ?? settings.programId,
      agentId: selectedAgent?.agentId,
    };
  }, [
    accountValues,
    argsText,
    programId,
    schema,
    selectedAgent?.agentId,
    settings.endpoint,
    settings.programId,
    walletAddress,
  ]);

  const buildMutation = useMutation({
    mutationFn: () =>
      postBackend<InstructionBuildResponse>(
        settings.backendUrl,
        "/v1/instructions/build",
        buildPayload(),
      ),
    onMutate: () => {
      setFormError(null);
      setSignature(null);
    },
    onSuccess: (result) => {
      setBuildResult(result);
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const walletSendMutation = useMutation({
    mutationFn: async () => {
      const result = await postBackend<InstructionBuildResponse>(
        settings.backendUrl,
        "/v1/instructions/build",
        buildPayload(),
      );
      // Wallet must be one of the required signers
      if (walletAddress && !result.requiredSigners.includes(walletAddress)) {
        throw new Error(
          `Your wallet is not a required signer for this instruction. Required: ${result.requiredSigners.map((s) => shortenAddress(s, 4, 4)).join(", ")}. Use Agent Send instead.`,
        );
      }
      const instruction = deserializeInstruction(result.instruction);
      const txSignature = await sendWalletInstructions(connection, wallet, [
        instruction,
      ]);
      return { result, txSignature };
    },
    onMutate: () => {
      setFormError(null);
      setSignature(null);
    },
    onSuccess: ({ result, txSignature }) => {
      setBuildResult(result);
      setSignature(txSignature);
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const backendSendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId)
        throw new Error("Create and select an agent before backend sending.");
      return postBackend<InstructionBuildResponse & { signature: string }>(
        settings.backendUrl,
        "/v1/instructions/send",
        { ...buildPayload(), computeUnitLimit: 600_000 },
      );
    },
    onMutate: () => {
      setFormError(null);
      setSignature(null);
    },
    onSuccess: (result) => {
      setBuildResult(result);
      setSignature(result.signature);
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const copyInstruction = async () => {
    if (!buildResult) return;
    await navigator.clipboard.writeText(safeJson(buildResult));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const isBusy =
    buildMutation.isPending ||
    walletSendMutation.isPending ||
    backendSendMutation.isPending;
  const instruction = found.instruction;

  const backendSigner = selectedAgent?.publicKey
    ? shortenAddress(selectedAgent.publicKey, 4, 4)
    : (backendInfoQuery.data?.auth?.mode ?? "—");
  const backendSignerFull = selectedAgent?.publicKey ?? null;
  const programFull = programId ?? settings.programId;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyValue = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Instruction header ── */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-1 block">
          {found.domain.label}
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-(--text-main) mb-1">
          {instruction.label}
        </h2>
        <p className="text-sm text-(--text-muted) leading-relaxed mb-3">
          {instruction.description}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge className="px-2.5 py-1">
            {maturityLabels[instruction.maturity] ?? instruction.maturity}
          </Badge>
          <Badge className="px-2.5 py-1">
            {schema.accounts.length} accounts
          </Badge>
          <Badge className="px-2.5 py-1">{schema.args.length} args</Badge>
        </div>
      </div>

      {/* ── Execution context strip ── */}
      <div className="px-5 pb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border border-border rounded-sm px-3 py-2">
          {/* Backend signer */}
          <div className="flex items-center gap-1.5">
            <Shield className="size-3 text-(--text-muted)" animateOnHover />
            <span className="text-(--text-muted)">Signer</span>
            <span className="font-mono text-(--text-main)">
              {backendSigner}
            </span>
            {backendSignerFull && (
              <Tooltip
                content={copiedKey === "backend" ? "Copied!" : "Copy address"}
              >
                <button
                  type="button"
                  onClick={() => void copyValue(backendSignerFull, "backend")}
                  className="inline-flex size-5 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-main)"
                >
                  <Copy className="size-3" animateOnHover />
                </button>
              </Tooltip>
            )}
          </div>

          <div className="w-px h-3 bg-border hidden sm:block" />

          {/* Wallet */}
          <div className="flex items-center gap-1.5">
            <Wallet className="size-3 text-(--text-muted)" animateOnHover />
            <span className="text-(--text-muted)">Wallet</span>
            <span className="font-mono text-(--text-main)">
              {walletAddress
                ? shortenAddress(walletAddress, 4, 4)
                : "not connected"}
            </span>
            {walletAddress && (
              <Tooltip
                content={copiedKey === "wallet" ? "Copied!" : "Copy address"}
              >
                <button
                  type="button"
                  onClick={() => void copyValue(walletAddress, "wallet")}
                  className="inline-flex size-5 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-main)"
                >
                  <Copy className="size-3" animateOnHover />
                </button>
              </Tooltip>
            )}
          </div>

          <div className="w-px h-3 bg-border hidden sm:block" />

          {/* Program */}
          <div className="flex items-center gap-1.5">
            <FileText className="size-3 text-(--text-muted)" animateOnHover />
            <span className="text-(--text-muted)">Program</span>
            <span className="font-mono text-(--text-main)">
              {shortenAddress(programFull, 4, 4)}
            </span>
            <Tooltip
              content={copiedKey === "program" ? "Copied!" : "Copy program ID"}
            >
              <button
                type="button"
                onClick={() => void copyValue(programFull, "program")}
                className="inline-flex size-5 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-main)"
              >
                <Copy className="size-3" animateOnHover />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {formError && (
            <Alert
              variant="error"
              message={formError}
              onClose={() => setFormError(null)}
            />
          )}
          {signature && (
            <Alert
              variant="success"
              message={`Transaction confirmed: ${signature}`}
              onClose={() => setSignature(null)}
            />
          )}

          {/* Accounts */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Accounts
              </h3>
              <span className="text-xs text-(--text-muted)">
                {schema.accounts.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {schema.accounts.map((account) => (
                <div key={account.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                      {account.name}
                    </span>
                    {account.signer && (
                      <Badge variant="active" className="px-2 py-0.5">
                        signer
                      </Badge>
                    )}
                    {account.writable && (
                      <Badge className="px-2 py-0.5">writable</Badge>
                    )}
                    {account.optional && (
                      <Badge className="px-2 py-0.5">optional</Badge>
                    )}
                  </div>
                  <SmartAccountInput
                    name={account.name}
                    value={accountValues[account.name] ?? ""}
                    optional={account.optional ?? false}
                    onChange={(v) =>
                      setAccountValues((cur) => ({
                        ...cur,
                        [account.name]: v,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Arguments */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Arguments
              </h3>
              <span className="text-xs text-(--text-muted)">
                {schema.args.length}
              </span>
            </div>
            {schema.args.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {schema.args.map((arg) => (
                  <Badge key={arg.name} className="px-2 py-0.5">
                    {arg.name}: {arg.typeLabel}
                  </Badge>
                ))}
              </div>
            )}
            <Textarea
              label="Args JSON"
              value={argsText}
              spellCheck={false}
              autoComplete="off"
              className="min-h-40 font-mono text-xs leading-relaxed"
              onChange={(e) => setArgsText(e.target.value)}
            />
          </section>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              icon={
                buildMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" animateOnHover />
                )
              }
              loading={buildMutation.isPending}
              onClick={() => buildMutation.mutate()}
            >
              Inspect
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={
                walletSendMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wallet className="size-4" animateOnHover />
                )
              }
              loading={walletSendMutation.isPending}
              disabled={!wallet.publicKey || isBusy}
              onClick={() => walletSendMutation.mutate()}
            >
              Sign & Send
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={
                backendSendMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" animateOnHover />
                )
              }
              loading={backendSendMutation.isPending}
              disabled={isBusy || !selectedAgent}
              onClick={() => backendSendMutation.mutate()}
            >
              Agent Send
            </Button>
          </div>

          {/* Built instruction output */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkcircle
                  className="size-3.5 text-(--text-muted)"
                  animateOnHover
                />
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  Built Instruction
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void copyInstruction()}
                disabled={!buildResult}
                className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Copy built instruction"
              >
                <Copy className="size-3.5" animateOnHover />
              </button>
            </div>
            {buildResult ? (
              <div className="space-y-2">
                {copied && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    Copied
                  </p>
                )}
                <div className="rounded-sm border border-border bg-(--input-bg) p-4">
                  <pre className="max-h-[360px] overflow-auto text-xs leading-relaxed text-(--text-main)">
                    {safeJson(buildResult)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-sm border border-border bg-(--hover-bg) p-4 text-sm text-(--text-muted)">
                Inspect an instruction to see accounts, serialized data, and
                required signers.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
