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
  SquareArrowOutUpRight,
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
import { cn, shortenAddress } from "@/lib/utils";

type CatalogInstruction =
  InstructionCatalogResponse["domains"][number]["instructions"][number];

// Well-known account descriptions
const ACCOUNT_DESCRIPTIONS: Record<string, string> = {
  treasury: "The treasury PDA that owns the policy config and pending queue.",
  parent_treasury: "The parent treasury in a swarm hierarchy.",
  child_treasury: "A child treasury in a swarm hierarchy.",
  swarm_treasury: "Another treasury sharing the same swarm spending pool.",
  owner: "The wallet that owns this treasury. Must sign.",
  payer: "The account paying transaction fees and rent. Must sign.",
  authority: "The authority account for this operation. Must sign.",
  ai_authority: "The AI agent keypair set as the treasury's AI authority.",
  agent: "The backend agent keypair signing on behalf of the AI authority.",
  signer: "The required signer for this instruction.",
  ai_signer: "The AI authority signer.",
  caller: "The calling program or integration account.",
  caller_program:
    "The program ID of the caller — usually the aura-core program ID.",
  system_program: "Solana's System Program. Required for account creation.",
  encrypt_program: "The Ika Encrypt program used for FHE operations.",
  dwallet_program: "The Ika dWallet program used for co-signing.",
  config: "The Encrypt program config account.",
  deposit: "The Encrypt deposit account for this payer.",
  network_encryption_key:
    "The Encrypt network's public encryption key account.",
  event_authority: "The Encrypt event authority PDA.",
  cpi_authority:
    "The aura-core CPI authority PDA used for cross-program invocations.",
  request_account:
    "The decryption request account created during FHE evaluation.",
  ciphertext: "The FHE ciphertext account holding the policy output.",
  message_approval:
    "The dWallet MessageApproval PDA — created when approve_message is called.",
  dwallet_account: "The on-chain dWallet PDA registered on this treasury.",
  dwallet_coordinator:
    "The dWallet coordinator PDA on the Ika dWallet program.",
  liveness: "The external liveness record account for this treasury.",
  snapshot: "The snapshot account storing a point-in-time policy state.",
  health_score:
    "The health score account tracking treasury operational health.",
  policy_history:
    "The policy history account storing past policy check results.",
  activity_log: "The append-only activity log account for this treasury.",
  fee_vault: "The protocol fee vault account.",
  result: "The policy check result account written by check_policy_cpi.",
  address_list: "The address list account for allowlist/blocklist management.",
  swarm_pool: "The shared swarm spending pool account.",
  session_key: "The session key account for delegated signing.",
};

// Well-known arg descriptions
const ARG_DESCRIPTIONS: Record<string, string> = {
  now: "Current Unix timestamp (seconds). Used for TTL and staleness checks.",
  chain_code:
    "Target chain: 0=Bitcoin, 1=Ethereum, 2=Solana, 3=Polygon, 4=Arbitrum, 5=Optimism.",
  amount_usd: "Amount in USD cents (e.g. 150000 = $1,500.00).",
  agent_id:
    "Unique kebab-case identifier for the AI agent — this is the treasury name (e.g. my-agent-1). Used as a PDA seed alongside the owner wallet.",
  args: "Instruction arguments as a JSON object. See the type badges above for field names and types.",
  bump: "PDA bump seed. Usually derived automatically — leave as 0 unless you know the exact bump.",
  proposal_id: "The numeric ID of the proposal on this treasury.",
  chain:
    "Target chain: 0=Bitcoin, 1=Ethereum, 2=Solana, 3=Polygon, 4=Arbitrum, 5=Optimism.",
  tx_type:
    "Transaction type: 0=Transfer, 1=DeFi Swap, 2=Lending Deposit, 3=NFT Purchase, 4=Contract Interaction.",
  max_staleness_secs:
    "Maximum age in seconds before an external liveness signal is considered stale.",
  required_signatures:
    "Number of guardian signatures required for multisig operations.",
};

function accountTooltip(
  name: string,
  account: {
    signer: boolean;
    writable: boolean;
    optional: boolean;
    address?: string;
  },
): string {
  const desc = ACCOUNT_DESCRIPTIONS[name];
  const flags: string[] = [];
  if (account.signer) flags.push("signer");
  if (account.writable) flags.push("writable");
  if (account.optional) flags.push("optional");
  if (account.address) flags.push(`fixed: ${account.address.slice(0, 8)}…`);
  const flagStr = flags.length > 0 ? ` · ${flags.join(", ")}` : "";
  return desc ? `${desc}${flagStr}` : `Account: ${name}${flagStr}`;
}

function argTooltip(name: string, typeLabel: string): string {
  const desc = ARG_DESCRIPTIONS[name];
  return desc ? `${desc} · type: ${typeLabel}` : `type: ${typeLabel}`;
}

function InfoIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      className="text-(--text-muted) shrink-0 opacity-50 hover:opacity-100 transition-opacity"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5.5" stroke="currentColor" />
      <path d="M6 5.5v3" stroke="currentColor" strokeLinecap="round" />
      <circle cx="6" cy="3.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

// Smart arg field
// Renders a single typed input for a flat arg value.
// Returns null for complex types (vec, nested struct) — caller falls back to JSON.

function isComplexType(typeLabel: string): boolean {
  return (
    typeLabel.startsWith("vec<") ||
    typeLabel.startsWith("[") ||
    // Nested structs other than the top-level args wrapper
    (typeLabel !== "string" &&
      typeLabel !== "bool" &&
      typeLabel !== "pubkey" &&
      !typeLabel.match(/^(u|i)(8|16|32|64|128)$/) &&
      !typeLabel.startsWith("option<") &&
      typeLabel !== "bytes")
  );
}

function ArgField({
  name,
  typeLabel,
  value,
  onChange,
}: {
  name: string;
  typeLabel: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const desc = ARG_DESCRIPTIONS[name];
  const label = (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
        {name}
      </span>
      <span className="font-mono text-[9px] text-(--text-muted) opacity-60">
        {typeLabel}
      </span>
      {desc && (
        <Tooltip content={desc}>
          <span className="cursor-help inline-flex">
            <InfoIcon />
          </span>
        </Tooltip>
      )}
    </div>
  );

  const innerType = typeLabel.startsWith("option<")
    ? typeLabel.slice(7, -1)
    : typeLabel;
  const isOptional = typeLabel.startsWith("option<");

  if (innerType === "bool") {
    const checked = value === true || value === "true";
    return (
      <div>
        {label}
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
            checked
              ? "bg-primary border-primary"
              : "bg-(--hover-bg) border-border",
          )}
        >
          <span
            className={cn(
              "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    );
  }

  if (
    innerType === "u8" ||
    innerType === "u16" ||
    innerType === "u32" ||
    innerType === "i8" ||
    innerType === "i16" ||
    innerType === "i32"
  ) {
    return (
      <div>
        {label}
        <input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          placeholder={isOptional ? "optional" : "0"}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className="w-full px-3 py-2 font-mono text-xs bg-(--input-bg) border border-border rounded-sm text-(--text-main) placeholder:text-(--text-muted) focus:outline-none focus:border-primary transition-colors"
        />
      </div>
    );
  }

  if (
    innerType === "u64" ||
    innerType === "i64" ||
    innerType === "u128" ||
    innerType === "i128"
  ) {
    return (
      <div>
        {label}
        <input
          type="text"
          inputMode="numeric"
          value={value === null || value === undefined ? "" : String(value)}
          placeholder={isOptional ? "optional" : "0"}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
          className="w-full px-3 py-2 font-mono text-xs bg-(--input-bg) border border-border rounded-sm text-(--text-main) placeholder:text-(--text-muted) focus:outline-none focus:border-primary transition-colors"
        />
      </div>
    );
  }

  // string, pubkey, bytes, option<string>, option<pubkey>
  return (
    <div>
      {label}
      <input
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        placeholder={
          isOptional ? "optional" : innerType === "pubkey" ? "public key" : ""
        }
        autoComplete="off"
        spellCheck={false}
        onChange={(e) =>
          onChange(e.target.value === "" && isOptional ? null : e.target.value)
        }
        className="w-full px-3 py-2 font-mono text-xs bg-(--input-bg) border border-border rounded-sm text-(--text-main) placeholder:text-(--text-muted) focus:outline-none focus:border-primary transition-colors"
      />
    </div>
  );
}

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
    return injectNow(schema.args[0].sample as Record<string, unknown>);
  }
  const sample = Object.fromEntries(
    schema.args.map((arg) => [arg.name, arg.sample]),
  );
  return injectNow(sample);
}

// Replace any "now" or "current_timestamp" field that has a zero/string-zero
// sample with the actual current Unix timestamp so audit events get real times.
// Also inject a placeholder for agentId so the user knows what to fill in.
function injectNow(sample: Record<string, unknown>): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000).toString();
  const result = { ...sample };
  for (const key of ["now", "current_timestamp", "created_at", "timestamp"]) {
    if (key in result && (result[key] === "0" || result[key] === 0)) {
      result[key] = now;
    }
  }
  // agentId is the treasury name — prompt the user to fill it in
  if ("agentId" in result && result["agentId"] === "") {
    result["agentId"] = "my-agent-1";
  }
  return result;
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

// ArgEditor
// Renders structured per-field inputs for instruction arguments.
// For a single "args: StructType" arg, flattens the struct fields.
// Falls back to a JSON textarea for complex/nested types.

function ArgEditor({
  schema,
  argsText,
  onChange,
}: {
  schema: ProgramInstructionSchema;
  argsText: string;
  onChange: (json: string) => void;
}) {
  // Parse current JSON — silently ignore parse errors (user may be mid-edit)
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(argsText || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch {
    // keep empty
  }

  if (schema.args.length === 0) {
    return (
      <div className="px-3 py-2 rounded-sm border border-border bg-(--hover-bg)">
        <span className="font-mono text-[10px] text-(--text-muted)">
          No arguments
        </span>
      </div>
    );
  }

  // Single "args: StructType" — flatten struct fields into individual inputs
  const singleStructArg =
    schema.args.length === 1 &&
    schema.args[0]?.name === "args" &&
    schema.args[0].sample &&
    typeof schema.args[0].sample === "object" &&
    !Array.isArray(schema.args[0].sample)
      ? (schema.args[0].sample as Record<string, unknown>)
      : null;

  if (singleStructArg) {
    const fields = Object.entries(singleStructArg);
    // Check if any field is complex — if so, fall back to textarea
    const hasComplex = fields.some(([, v]) =>
      typeof v === "object" && v !== null && !Array.isArray(v) === false
        ? false
        : Array.isArray(v),
    );
    if (hasComplex) {
      return (
        <Textarea
          label=""
          value={argsText}
          spellCheck={false}
          autoComplete="off"
          className="min-h-40 font-mono text-xs leading-relaxed"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    // Find the typeLabel for each field from the IDL sample keys
    // We don't have per-field type info in the schema for struct fields,
    // so we infer from the sample value type
    const inferType = (v: unknown): string => {
      if (typeof v === "boolean") return "bool";
      if (typeof v === "number") return "u32";
      if (typeof v === "string") {
        if (v === "$signer" || v === "$wallet") return "pubkey";
        if (/^\d+$/.test(v)) return "u64";
        return "string";
      }
      if (v === null) return "option<string>";
      if (Array.isArray(v)) return "vec";
      if (typeof v === "object") return "struct";
      return "string";
    };

    return (
      <div className="space-y-3">
        {fields.map(([key, sampleVal]) => {
          const typeLabel = inferType(sampleVal);
          if (typeLabel === "vec" || typeLabel === "struct") {
            // Render complex fields as a mini JSON textarea
            const fieldVal = parsed[key];
            return (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                    {key}
                  </span>
                  <span className="font-mono text-[9px] text-(--text-muted) opacity-60">
                    {typeLabel}
                  </span>
                  {ARG_DESCRIPTIONS[key] && (
                    <Tooltip content={ARG_DESCRIPTIONS[key]}>
                      <span className="cursor-help inline-flex">
                        <InfoIcon />
                      </span>
                    </Tooltip>
                  )}
                </div>
                <Textarea
                  label=""
                  value={safeJson(fieldVal ?? sampleVal)}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-h-24 font-mono text-xs leading-relaxed"
                  onChange={(e) => {
                    try {
                      const v = JSON.parse(e.target.value);
                      const next = { ...parsed, [key]: v };
                      onChange(safeJson(next));
                    } catch {
                      // let user keep typing
                    }
                  }}
                />
              </div>
            );
          }
          return (
            <ArgField
              key={key}
              name={key}
              typeLabel={typeLabel}
              value={parsed[key] ?? sampleVal}
              onChange={(v) => {
                const next = { ...parsed, [key]: v };
                onChange(safeJson(next));
              }}
            />
          );
        })}
      </div>
    );
  }

  // Multiple flat args — render each directly
  return (
    <div className="space-y-3">
      {schema.args.map((arg) => {
        if (isComplexType(arg.typeLabel)) {
          return (
            <div key={arg.name}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                  {arg.name}
                </span>
                <span className="font-mono text-[9px] text-(--text-muted) opacity-60">
                  {arg.typeLabel}
                </span>
                {ARG_DESCRIPTIONS[arg.name] && (
                  <Tooltip content={ARG_DESCRIPTIONS[arg.name]}>
                    <span className="cursor-help inline-flex">
                      <InfoIcon />
                    </span>
                  </Tooltip>
                )}
              </div>
              <Textarea
                label=""
                value={safeJson(parsed[arg.name] ?? arg.sample)}
                spellCheck={false}
                autoComplete="off"
                className="min-h-24 font-mono text-xs leading-relaxed"
                onChange={(e) => {
                  try {
                    const v = JSON.parse(e.target.value);
                    const next = { ...parsed, [arg.name]: v };
                    onChange(safeJson(next));
                  } catch {
                    /* let user keep typing */
                  }
                }}
              />
            </div>
          );
        }
        return (
          <ArgField
            key={arg.name}
            name={arg.name}
            typeLabel={arg.typeLabel}
            value={parsed[arg.name] ?? arg.sample}
            onChange={(v) => {
              const next = { ...parsed, [arg.name]: v };
              onChange(safeJson(next));
            }}
          />
        );
      })}
    </div>
  );
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
  const [rawMode, setRawMode] = useState(false);
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

  // Fire-and-forget: register a playground event in the activity log.
  // Works for both wallet sends (frontend-only) and agent sends (backend already
  // writes the event, but a second write is harmless — idempotent by tx sig).
  const registerPlaygroundEvent = (
    txSignature: string,
    result: InstructionBuildResponse,
  ) => {
    const treasury =
      result.normalizedAccounts["treasury"] ??
      result.normalizedAccounts["parent_treasury"];
    const treasuryAddress = typeof treasury === "string" ? treasury : null;
    if (!treasuryAddress) return;
    postBackend(settings.backendUrl, "/v1/activity/register-event", {
      treasuryAddress,
      txSignature,
      kind: "instruction_sent",
      walletAddress: walletAddress,
      meta: {
        instruction: schema.name,
        source: "playground",
      },
    }).catch(() => {});
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

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
      registerPlaygroundEvent(txSignature, result);
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
      registerPlaygroundEvent(result.signature, result);
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
      {/* Instruction header */}
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

      {/* Execution context strip */}
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

      {/* Status strip (always visible, above scroll) */}
      {(formError || signature) && (
        <div className="px-5 pb-3 shrink-0 space-y-2">
          {formError && (
            <Alert
              variant="error"
              message={formError}
              onClose={() => setFormError(null)}
            />
          )}
          {signature && (
            <div className="rounded-sm border border-success/30 bg-success/10 px-4 py-3 flex items-start gap-3">
              <Checkcircle
                className="size-4 text-success shrink-0 mt-0.5"
                animateOnHover
              />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-widest text-success mb-1">
                  Transaction confirmed
                </p>
                <p className="font-mono text-[11px] text-(--text-main) break-all leading-relaxed">
                  {signature}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip content={copied ? "Copied!" : "Copy signature"}>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(signature);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                  >
                    <Copy className="size-3.5" animateOnHover />
                  </button>
                </Tooltip>
                <Tooltip content="View on Explorer">
                  <a
                    href={`https://explorer.solana.com/tx/${signature}?cluster=${settings.network ?? "devnet"}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                  >
                    <SquareArrowOutUpRight
                      className="size-3.5"
                      animateOnHover
                    />
                  </a>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => setSignature(null)}
                  className="inline-flex size-7 items-center justify-center rounded-sm border border-border text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                  aria-label="Dismiss"
                >
                  <span className="text-xs leading-none">×</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
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
                    <Tooltip content={accountTooltip(account.name, account)}>
                      <span className="cursor-help inline-flex">
                        <InfoIcon />
                      </span>
                    </Tooltip>
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
                    instructionName={schema.name}
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-(--text-muted)">
                  {schema.args.length}
                </span>
                <button
                  type="button"
                  onClick={() => setRawMode((v) => !v)}
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-sm border transition-colors",
                    rawMode
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
                  )}
                >
                  {rawMode ? "Structured" : "Raw JSON"}
                </button>
              </div>
            </div>

            {rawMode ? (
              <Textarea
                label=""
                value={argsText}
                spellCheck={false}
                autoComplete="off"
                className="min-h-40 font-mono text-xs leading-relaxed"
                onChange={(e) => setArgsText(e.target.value)}
              />
            ) : (
              <ArgEditor
                schema={schema}
                argsText={argsText}
                onChange={setArgsText}
              />
            )}
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
