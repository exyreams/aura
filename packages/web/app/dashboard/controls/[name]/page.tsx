"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileCode2,
  Loader2,
  Play,
  Send,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Input } from "@/components/global/Input";
import { Skeleton } from "@/components/global/Skeleton";
import { Textarea } from "@/components/global/Textarea";
import { deserializeInstruction, sendWalletInstructions } from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import {
  type InstructionBuildResponse,
  type InstructionCatalogResponse,
  type ProgramInstructionSchema,
  useAgents,
  useAppSettings,
  useBackendInfo,
  useInstructionCatalog,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

type CatalogInstruction =
  InstructionCatalogResponse["domains"][number]["instructions"][number];

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

function getRouteName(value: string | string[] | undefined) {
  return decodeURIComponent(
    Array.isArray(value) ? (value[0] ?? "") : (value ?? ""),
  );
}

function buildInstructionMap(
  catalog: InstructionCatalogResponse | undefined,
): Map<
  string,
  {
    domain: InstructionCatalogResponse["domains"][number];
    instruction: InstructionCatalogResponse["domains"][number]["instructions"][number];
  }
> {
  const map = new Map<
    string,
    {
      domain: InstructionCatalogResponse["domains"][number];
      instruction: InstructionCatalogResponse["domains"][number]["instructions"][number];
    }
  >();
  if (!catalog) return map;
  for (const domain of catalog.domains) {
    for (const instruction of domain.instructions) {
      map.set(instruction.name, { domain, instruction });
    }
  }
  return map;
}

function findInstruction(
  catalog: InstructionCatalogResponse | undefined,
  name: string,
) {
  if (!catalog) return null;
  return buildInstructionMap(catalog).get(name) ?? null;
}

function buildArgsSample(schema: ProgramInstructionSchema) {
  if (schema.args.length === 0) {
    return {};
  }
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
      if (account.address) {
        return [account.name, account.address];
      }
      if (account.name === "system_program") {
        return [account.name, SYSTEM_PROGRAM_ID];
      }
      if (account.name === "caller_program" && programId) {
        return [account.name, programId];
      }
      if (account.signer && walletAddress) {
        return [account.name, walletAddress];
      }
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
      if (!walletAddress) {
        throw new Error("Connect a wallet before using wallet placeholders.");
      }
      return walletAddress;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      replaceWalletPlaceholders(entry, walletAddress),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        replaceWalletPlaceholders(entry, walletAddress),
      ]),
    );
  }
  return value;
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function AccountBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "warning";
}) {
  return (
    <span
      className={cn(
        "rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
        tone === "primary" && "border-primary/50 text-(--text-main)",
        tone === "warning" && "border-amber-400/30 text-amber-200",
        tone === "neutral" && "border-border text-(--text-muted)",
      )}
    >
      {children}
    </span>
  );
}

function InstructionSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-40" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Skeleton className="h-[560px]" />
        <Skeleton className="h-[560px]" />
      </div>
    </div>
  );
}

export default function ProgramInstructionPage() {
  const params = useParams<{ name?: string | string[] }>();
  const instructionName = getRouteName(params.name);
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const wallet = useWallet();
  const { connection } = useConnection();
  const instructionCatalogQuery = useInstructionCatalog();
  const backendInfoQuery = useBackendInfo();
  const queryClient = useQueryClient();
  const instructionMap = useMemo(
    () => buildInstructionMap(instructionCatalogQuery.data),
    [instructionCatalogQuery.data],
  );
  const found = useMemo(
    () => instructionMap.get(instructionName) ?? null,
    [instructionMap, instructionName],
  );
  const schema = found?.instruction.schema ?? null;
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
    if (!schema) {
      return;
    }
    setAccountValues(buildDefaultAccounts(schema, walletAddress, programId));
    setArgsText(safeJson(buildArgsSample(schema)));
    setBuildResult(null);
    setSignature(null);
    setFormError(null);
  }, [programId, schema, walletAddress]);

  const buildPayload = useCallback(() => {
    if (!schema) {
      throw new Error("Instruction schema is not available.");
    }
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(argsText || "{}") as unknown;
    } catch {
      throw new Error("Arguments must be valid JSON.");
    }
    const accounts = Object.fromEntries(
      Object.entries(accountValues).map(([key, value]) => [key, value.trim()]),
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
      // Instruction builder — no treasury state to invalidate
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
  });

  const walletSendMutation = useMutation({
    mutationFn: async () => {
      const result = await postBackend<InstructionBuildResponse>(
        settings.backendUrl,
        "/v1/instructions/build",
        buildPayload(),
      );
      const walletSigner = wallet.publicKey?.toBase58();
      const missingWalletSigners = result.requiredSigners.filter(
        (signer) => signer !== walletSigner,
      );
      if (missingWalletSigners.length > 0) {
        throw new Error(
          `Wallet cannot sign required signer(s): ${missingWalletSigners.join(", ")}.`,
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
      // Instruction sent — no treasury cache to invalidate
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
  });

  const backendSendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error("Create and select an agent before backend sending.");
      }
      return postBackend<InstructionBuildResponse & { signature: string }>(
        settings.backendUrl,
        "/v1/instructions/send",
        {
          ...buildPayload(),
          computeUnitLimit: 600_000,
        },
      );
    },
    onMutate: () => {
      setFormError(null);
      setSignature(null);
    },
    onSuccess: (result) => {
      setBuildResult(result);
      setSignature(result.signature);
      // Instruction sent — no treasury cache to invalidate
      void queryClient.invalidateQueries({ queryKey: ["instruction-catalog"] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : String(error));
    },
  });

  const copyInstruction = async () => {
    if (!buildResult) {
      return;
    }
    await navigator.clipboard.writeText(safeJson(buildResult));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (instructionCatalogQuery.isLoading) {
    return <InstructionSkeleton />;
  }

  if (!found || !schema) {
    return (
      <div className="mx-auto max-w-[960px]">
        <Link
          href="/dashboard/controls"
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="size-3.5" />
          Controls
        </Link>
        <Alert
          variant="warning"
          message="Instruction schema is unavailable from the backend catalog."
        />
      </div>
    );
  }

  const instruction = found.instruction as CatalogInstruction;
  const isBusy =
    buildMutation.isPending ||
    walletSendMutation.isPending ||
    backendSendMutation.isPending;

  return (
    <div className="mx-auto max-w-[1500px]">
      <Link
        href="/dashboard/controls"
        className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="size-3.5" />
        Controls
      </Link>

      <header className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <span className="mono mb-2 block text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
            {found.domain.label}
          </span>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-(--text-main) lg:text-4xl">
            {instruction.label}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-(--text-muted)">
            {instruction.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AccountBadge tone="primary">{instruction.maturity}</AccountBadge>
          <AccountBadge>{schema.accounts.length} accounts</AccountBadge>
          <AccountBadge>{schema.args.length} args</AccountBadge>
        </div>
      </header>

      {formError && (
        <Alert variant="error" message={formError} className="mb-6" />
      )}
      {signature && (
        <Alert
          variant="success"
          message={`Transaction confirmed: ${signature}`}
          className="mb-6"
        />
      )}
      {instructionCatalogQuery.isError && (
        <Alert
          variant="warning"
          message="Backend instruction catalog could not refresh. Retry from settings after backend configuration changes."
          className="mb-6"
        />
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card className="p-0" hover={false}>
          <div className="border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-(--hover-bg)">
                <FileCode2 className="size-5 text-(--text-main)" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-(--text-main)">
                  Instruction Builder
                </h2>
                <code className="text-xs text-(--text-muted)">
                  {schema.name}
                </code>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  Accounts
                </h3>
                <span className="text-xs text-(--text-muted)">
                  {schema.accounts.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {schema.accounts.map((account) => (
                  <div key={account.name} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                        {account.name}
                      </span>
                      {account.signer && (
                        <AccountBadge tone="primary">signer</AccountBadge>
                      )}
                      {account.writable && (
                        <AccountBadge>writable</AccountBadge>
                      )}
                      {account.optional && (
                        <AccountBadge>optional</AccountBadge>
                      )}
                    </div>
                    <Input
                      aria-label={`${account.name} account`}
                      value={accountValues[account.name] ?? ""}
                      placeholder={account.optional ? "optional" : "public key"}
                      autoComplete="off"
                      onChange={(event) =>
                        setAccountValues((current) => ({
                          ...current,
                          [account.name]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  Arguments
                </h3>
                <span className="text-xs text-(--text-muted)">
                  {schema.args.length}
                </span>
              </div>
              {schema.args.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {schema.args.map((arg) => (
                    <AccountBadge key={arg.name}>
                      {arg.name}: {arg.typeLabel}
                    </AccountBadge>
                  ))}
                </div>
              )}
              <Textarea
                label="Args JSON"
                value={argsText}
                spellCheck={false}
                autoComplete="off"
                className="min-h-72 font-mono text-xs leading-relaxed"
                onChange={(event) => setArgsText(event.target.value)}
              />
            </section>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                icon={
                  buildMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )
                }
                loading={buildMutation.isPending}
                onClick={() => buildMutation.mutate()}
              >
                Build
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={
                  walletSendMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wallet className="size-4" />
                  )
                }
                loading={walletSendMutation.isPending}
                disabled={!wallet.publicKey || isBusy}
                onClick={() => walletSendMutation.mutate()}
              >
                Wallet Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={
                  backendSendMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )
                }
                loading={backendSendMutation.isPending}
                disabled={isBusy || !selectedAgent}
                onClick={() => backendSendMutation.mutate()}
              >
                Backend Send
              </Button>
            </div>
          </div>
        </Card>

        <aside className="space-y-5">
          <Card className="p-6" hover={false}>
            <div className="mb-4 flex items-center gap-3">
              <ShieldAlert className="size-5 text-(--text-main)" />
              <h2 className="text-sm font-semibold text-(--text-main)">
                Execution Context
              </h2>
            </div>
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-(--text-muted)">Backend</dt>
                <dd className="break-all text-right font-mono text-(--text-main)">
                  {selectedAgent?.publicKey ??
                    backendInfoQuery.data?.auth?.mode ??
                    "unavailable"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--text-muted)">Wallet</dt>
                <dd className="break-all text-right font-mono text-(--text-main)">
                  {walletAddress ?? "not connected"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--text-muted)">Program</dt>
                <dd className="break-all text-right font-mono text-(--text-main)">
                  {programId ?? settings.programId}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6" hover={false}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-(--text-main)" />
                <h2 className="text-sm font-semibold text-(--text-main)">
                  Built Instruction
                </h2>
              </div>
              <button
                type="button"
                onClick={copyInstruction}
                disabled={!buildResult}
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-sm border border-border text-(--text-muted) transition-colors hover:bg-(--hover-bg) hover:text-(--text-main) disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Copy built instruction"
              >
                <Copy className="size-4" />
              </button>
            </div>
            {buildResult ? (
              <div className="space-y-4">
                {copied && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    Copied
                  </p>
                )}
                <div className="rounded-sm border border-border bg-(--input-bg) p-4">
                  <pre className="max-h-[520px] overflow-auto text-xs leading-relaxed text-(--text-main)">
                    {safeJson(buildResult)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-sm border border-border bg-(--hover-bg) p-6 text-sm text-(--text-muted)">
                Build an instruction to inspect accounts, serialized data, and
                required signers.
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
