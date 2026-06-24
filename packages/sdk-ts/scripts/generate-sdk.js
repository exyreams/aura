import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgRoot = path.resolve(__dirname, "..");
const idlPath = path.join(pkgRoot, "src/generated/aura_core.json");
const surfacePath = path.join(pkgRoot, "src/program-surface.ts");

console.log("Loading IDL from:", idlPath);
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

// Helper to convert PascalCase or snake_case to camelCase
function toCamelCase(str) {
  // If it's already camelCase or PascalCase, just lower the first character
  // But if it has underscores, convert snake_case first
  let s = str;
  if (s.includes("_")) {
    s = s.replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase());
  }
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Helper to capitalize first letter (camelCase/snake_case to PascalCase)
function capitalize(str) {
  const c = toCamelCase(str);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// Canonical SDK domains — one instruction module file per domain.
const DOMAIN_META = [
  {
    id: "treasury",
    label: "Treasury Lifecycle",
    description:
      "Create, migrate, and configure core treasury state, analytics, and recipient limits.",
  },
  {
    id: "confidential",
    label: "Confidential Execution",
    description:
      "Encrypted guardrails, FHE proposals, and the policy decryption flow.",
  },
  {
    id: "execution",
    label: "Execution",
    description:
      "Public and conditional proposals, settlement, scheduled intents, and finalization.",
  },
  {
    id: "governance",
    label: "Governance",
    description:
      "Multisig, overrides, authority and guardian rotation, config changes, recovery, and shutdown.",
  },
  {
    id: "dwallet",
    label: "dWallet",
    description:
      "dWallet registration, runtime state, balances, oracle feeds, and spend reservations.",
  },
  {
    id: "policy",
    label: "Policy Services",
    description:
      "Presets, templates, simulations, receipts, attestations, history, canaries, and trust.",
  },
  {
    id: "budget",
    label: "Budgets & Exposure",
    description:
      "Budget envelopes, exposure groups, approval ladders, and liveness guardrails.",
  },
  {
    id: "operational",
    label: "Operations",
    description:
      "Scoped pauses, external liveness, health scores, snapshots, and activity logs.",
  },
  {
    id: "lifecycle",
    label: "Lifecycle & Roles",
    description:
      "Agent identity and capabilities, ownership, operator roles, session keys, chain and protocol config.",
  },
  {
    id: "swarm",
    label: "Swarm Pools",
    description: "Shared agent-pool initialization and membership.",
  },
  {
    id: "fees",
    label: "Protocol Fees",
    description:
      "Fee schedules, vaults, billing templates, collection, and payouts.",
  },
  {
    id: "address-lists",
    label: "Address Lists",
    description: "Allow and deny lists for recipients and contracts.",
  },
  {
    id: "batch",
    label: "Batch",
    description: "Batch policy simulation and proposal records.",
  },
];

const DOMAINS = DOMAIN_META.map((d) => d.id);

// Complete, authoritative instruction -> domain map. Derived from the program's
// own instruction module layout (programs/aura-core/src/instructions/*). Every
// IDL instruction MUST appear here — `getDomain` throws otherwise, so codegen
// fails loudly when the program gains a new instruction.
const INSTRUCTION_DOMAINS = {
  abandon_proposal: "execution",
  apply_billing_template: "fees",
  apply_org_profile: "fees",
  apply_policy_preset: "policy",
  apply_policy_template: "policy",
  apply_policy_template_parameterized: "policy",
  approve_pending_execution: "execution",
  arm_capability_loosen: "lifecycle",
  attest_policy: "policy",
  break_glass_recover: "governance",
  break_glass_transfer_authority: "governance",
  cancel_ai_rotation: "governance",
  cancel_pending: "execution",
  check_invariants: "policy",
  check_policy_cpi: "policy",
  clear_address_list: "address-lists",
  clear_scheduled_intent_in_flight: "execution",
  close_activity_log: "operational",
  close_address_list: "address-lists",
  close_billing_template: "fees",
  close_conditional_proposal: "execution",
  close_confidential_guardrails: "confidential",
  close_exposure_group: "budget",
  close_external_liveness: "operational",
  close_fee_schedule: "fees",
  close_fee_vault: "fees",
  close_health_score: "operational",
  close_policy_history: "policy",
  close_policy_template: "policy",
  close_scheduled_intent: "execution",
  close_session_key: "lifecycle",
  close_snapshot: "operational",
  close_swarm_pool: "swarm",
  close_treasury_analytics: "treasury",
  collect_fees: "fees",
  collect_override_signature: "governance",
  commit_protocol_config: "lifecycle",
  configure_approval_ladder: "budget",
  configure_budget_envelope: "budget",
  configure_confidential_guardrails: "confidential",
  configure_liveness_guardrails: "budget",
  configure_multisig: "governance",
  configure_swarm: "swarm",
  configure_trust_policy: "policy",
  confirm_policy_decryption: "confidential",
  confirm_settlement: "execution",
  create_billing_template: "fees",
  create_policy_template: "policy",
  create_scheduled_intent: "execution",
  create_treasury: "treasury",
  deposit_fees: "fees",
  disable_confidential_guardrails: "confidential",
  discard_canary: "policy",
  emergency_revoke_agent: "lifecycle",
  emergency_shutdown: "governance",
  execute_ai_rotation: "governance",
  execute_config_change: "governance",
  execute_guardian_rotation: "governance",
  execute_ownership_handover: "lifecycle",
  execute_pending: "execution",
  execute_scheduled_intent: "execution",
  finalize_execution: "execution",
  grant_operator_role: "lifecycle",
  init_activity_log: "operational",
  init_address_list: "address-lists",
  init_confidential_guardrails: "confidential",
  init_dwallet_state: "dwallet",
  init_exposure_group: "budget",
  init_external_liveness: "operational",
  init_fee_schedule: "fees",
  init_fee_vault: "fees",
  init_health_score: "operational",
  init_policy_history: "policy",
  init_protocol_config: "lifecycle",
  init_swarm_pool: "swarm",
  init_treasury_analytics: "treasury",
  init_trust_identity: "policy",
  issue_session_key: "lifecycle",
  join_exposure_group: "budget",
  join_swarm: "swarm",
  leave_exposure_group: "budget",
  leave_swarm: "swarm",
  manage_address_list: "address-lists",
  mark_settlement_broadcast: "execution",
  migrate_treasury: "lifecycle",
  nominate_successor_owner: "lifecycle",
  pause_execution: "execution",
  pause_scheduled_intent: "execution",
  promote_canary: "policy",
  propose_ai_rotation: "governance",
  propose_batch: "batch",
  propose_conditional_transaction: "execution",
  propose_confidential_batch: "batch",
  propose_confidential_transaction: "confidential",
  propose_config_change: "governance",
  propose_guardian_rotation: "governance",
  propose_override: "governance",
  propose_transaction: "execution",
  reconcile_dwallet_balance: "dwallet",
  record_deposit: "dwallet",
  record_policy_snapshot: "policy",
  refresh_asset_balance: "dwallet",
  refresh_dwallet_balance: "dwallet",
  refresh_external_liveness: "operational",
  refresh_health_score: "operational",
  refresh_verified_asset_balance: "dwallet",
  register_agent: "lifecycle",
  register_chain_profile: "lifecycle",
  register_dwallet: "dwallet",
  register_recovery_destination: "governance",
  release_dwallet_spend: "dwallet",
  remove_budget_envelope: "budget",
  remove_dwallet: "dwallet",
  remove_recipient_limit: "treasury",
  request_policy_decryption: "confidential",
  reserve_dwallet_spend: "dwallet",
  reset_confidential_counters: "confidential",
  restore_trust: "policy",
  resubmit_proposal: "execution",
  resume_scheduled_intent: "execution",
  revoke_agent: "lifecycle",
  revoke_operator_role: "lifecycle",
  revoke_session_key: "lifecycle",
  rollback_policy: "policy",
  rotate_confidential_guardrails: "confidential",
  rotate_dwallet_authority: "dwallet",
  set_agent_capability: "lifecycle",
  set_agent_tripwires: "lifecycle",
  set_asset_feed: "dwallet",
  set_asset_oracle_feed: "dwallet",
  set_default_chain: "dwallet",
  set_dwallet_label: "dwallet",
  set_dwallet_limits: "dwallet",
  set_dwallet_status: "dwallet",
  set_fee_splits: "fees",
  set_recipient_limit: "treasury",
  set_scoped_pause: "operational",
  settle_dwallet_spend: "dwallet",
  simulate_policy: "policy",
  start_canary: "policy",
  take_snapshot: "operational",
  transition_agent_state: "lifecycle",
  trigger_dead_mans_switch: "lifecycle",
  try_trigger: "execution",
  update_address_list_entry: "address-lists",
  update_billing_template: "fees",
  update_chain_profile: "lifecycle",
  update_confidential_guardrails: "confidential",
  update_exposure_group: "budget",
  update_fee_recipient: "fees",
  update_fee_schedule: "fees",
  update_operator_role: "lifecycle",
  update_policy_template: "policy",
  update_protocol_config: "lifecycle",
  update_scheduled_intent: "execution",
  update_session_key: "lifecycle",
  update_swarm: "swarm",
  update_treasury_metadata: "treasury",
  veto_config_change: "governance",
  withdraw_unused_fees: "fees",
  write_policy_receipt: "policy",
};

// Per-instruction maturity overrides; otherwise inferred by `inferMaturity`.
const MATURITY_OVERRIDES = {
  propose_confidential_transaction: "external_cpi",
  propose_confidential_batch: "external_cpi",
  configure_confidential_guardrails: "external_cpi",
  init_confidential_guardrails: "external_cpi",
  request_policy_decryption: "external_cpi",
  confirm_policy_decryption: "backend",
  check_policy_cpi: "backend",
};

function inferMaturity(name) {
  if (MATURITY_OVERRIDES[name]) return MATURITY_OVERRIDES[name];
  if (name.includes("confidential") || name.includes("decryption")) {
    return "external_cpi";
  }
  if (
    /^(refresh|reconcile)_/.test(name) ||
    name === "execute_pending" ||
    name === "execute_scheduled_intent" ||
    name === "finalize_execution" ||
    name === "collect_fees" ||
    name === "trigger_dead_mans_switch" ||
    name === "try_trigger"
  ) {
    return "backend";
  }
  return "wallet";
}

// Turn a snake_case instruction name into a human label, e.g.
// "set_dwallet_limits" -> "Set dwallet limits".
function humanizeLabel(name) {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function describeInstruction(name) {
  return `${humanizeLabel(name)}.`;
}

// Map each instruction to its domain. Throws on any unmapped instruction so the
// generator can never silently misfile a new instruction.
function getDomain(name) {
  const domain = INSTRUCTION_DOMAINS[name];
  if (!domain) {
    throw new Error(
      `No domain mapping for instruction "${name}". Add it to INSTRUCTION_DOMAINS in scripts/generate-sdk.js.`,
    );
  }
  return domain;
}

// Group instructions by domain
const groupedInstructions = {};
DOMAINS.forEach((d) => {
  groupedInstructions[d] = [];
});

idl.instructions.forEach((ix) => {
  const domain = getDomain(ix.name);
  if (!groupedInstructions[domain]) {
    groupedInstructions[domain] = [];
  }
  groupedInstructions[domain].push(ix);
});

console.log("Grouped instructions count:");
Object.keys(groupedInstructions).forEach((domain) => {
  console.log(`  ${domain}: ${groupedInstructions[domain].length}`);
});

// Ensure directory layout exists
const dirs = ["src/instructions", "src/accounts", "src/errors", "src/events"];
dirs.forEach((d) => {
  const dirPath = path.join(pkgRoot, d);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Write shared types for instructions
const sharedTypesContent = `import type { Program } from "@coral-xyz/anchor";
import type { AuraCore } from "../generated/aura_core.js";

type Methods = Program<AuraCore>["methods"];

/** Helper to get the argument tuple of a Program method */
export type MethodArgs<K extends keyof Methods> = Parameters<Methods[K]>;

/** Helper to get the accounts parameter of a Program method */
export type MethodAccounts<K extends keyof Methods> = Parameters<
  ReturnType<Methods[K]>["accountsStrict"]
>[0];
`;
fs.writeFileSync(
  path.join(pkgRoot, "src/instructions/types.ts"),
  sharedTypesContent,
);

// Generate instruction domain modules
Object.keys(groupedInstructions).forEach((domain) => {
  const ixs = groupedInstructions[domain];
  if (ixs.length === 0) return;

  const lines = [
    `/** Generated instruction builders for the ${domain} domain. Do not edit. */`,
    ``,
    `import type { TransactionInstruction, Signer, SendOptions } from "@solana/web3.js";`,
    `import type { AuraClient } from "../client.js";`,
    `import type { MethodAccounts, MethodArgs } from "./types.js";`,
    ``,
  ];

  ixs.forEach((ix) => {
    const camelName = toCamelCase(ix.name);
    const capitalizedCamel = capitalize(camelName);
    const inputTypeName = `${capitalizedCamel}Input`;

    lines.push(`/** Input for the \`${ix.name}\` instruction. */`);
    lines.push(`export type ${inputTypeName} = {`);
    lines.push(`  accounts: MethodAccounts<"${camelName}">;`);

    if (ix.args.length === 0) {
      lines.push(`  args?: undefined;`);
    } else if (
      ix.args.length === 1 &&
      toCamelCase(ix.args[0].name) === "args"
    ) {
      lines.push(`  args: MethodArgs<"${camelName}">[0];`);
    } else {
      lines.push(`  args: {`);
      ix.args.forEach((arg, idx) => {
        lines.push(
          `    ${toCamelCase(arg.name)}: MethodArgs<"${camelName}">[${idx}];`,
        );
      });
      lines.push(`  };`);
    }
    lines.push(`};`);
    lines.push(``);

    lines.push(`/** Builds a \`${ix.name}\` instruction. */`);
    lines.push(`export function ${camelName}(`);
    lines.push(`  client: AuraClient,`);
    lines.push(`  input: ${inputTypeName},`);
    lines.push(`): Promise<TransactionInstruction> {`);
    lines.push(`  return client.program.methods`);

    if (ix.args.length === 0) {
      lines.push(`    .${camelName}()`);
    } else if (
      ix.args.length === 1 &&
      toCamelCase(ix.args[0].name) === "args"
    ) {
      lines.push(`    .${camelName}(input.args)`);
    } else {
      const argsMapping = ix.args
        .map((arg) => `input.args.${toCamelCase(arg.name)}`)
        .join(", ");
      lines.push(`    .${camelName}(${argsMapping})`);
    }
    lines.push(`    .accountsStrict(input.accounts)`);
    lines.push(`    .instruction();`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`export const ${camelName}Instruction = ${camelName};`);
    lines.push(``);

    lines.push(`/** Builds and sends a \`${ix.name}\` transaction. */`);
    lines.push(`export async function send${capitalizedCamel}(`);
    lines.push(`  client: AuraClient,`);
    lines.push(`  payer: Signer,`);
    lines.push(`  input: ${inputTypeName},`);
    lines.push(`  extraSigners: Signer[] = [],`);
    lines.push(`  options?: SendOptions,`);
    lines.push(`): Promise<string> {`);
    lines.push(`  const instruction = await ${camelName}(client, input);`);
    lines.push(
      `  return await client.sendInstructions(payer, [instruction], extraSigners, options);`,
    );
    lines.push(`}`);
    lines.push(``);
  });

  fs.writeFileSync(
    path.join(pkgRoot, `src/instructions/${domain}.ts`),
    lines.join("\n"),
  );
});

// Generate instructions/index.ts
const instructionsIndexLines = [
  `/** Domain-grouped instruction builders. */`,
  ``,
  `export * from "./types.js";`,
  `export * from "./metadata.js";`,
];
Object.keys(groupedInstructions).forEach((domain) => {
  if (groupedInstructions[domain].length > 0) {
    instructionsIndexLines.push(
      `export * as ${toCamelCase(domain.replace("-", "_"))} from "./${domain}.js";`,
    );
  }
});
fs.writeFileSync(
  path.join(pkgRoot, "src/instructions/index.ts"),
  instructionsIndexLines.join("\n"),
);

// Group accounts by domain (in camelCase matching program.account namespace)
const DOMAIN_ACCOUNTS = {
  treasury: ["treasuryAccount", "treasuryAnalyticsAccount"],
  dwallet: ["dWalletAccount"],
  execution: ["batchProposalAccount", "conditionalProposal", "scheduledIntent"],
  confidential: ["confidentialGuardrailsAccount"],
  governance: ["operatorRoleAccount"],
  policy: [
    "policyAttestationAccount",
    "policyCanaryAccount",
    "policyCheckResult",
    "policyHistoryAccount",
    "policyReceiptAccount",
    "policySimulationResultAccount",
    "policyTemplate",
    "trustIdentityAccount",
    "complianceOracleAccount",
    "invariantReportAccount",
  ],
  budget: ["budgetEnvelopeAccount", "exposureGroupAccount"],
  operational: [
    "activityLogAccount",
    "externalLivenessAccount",
    "healthScoreAccount",
    "snapshotAccount",
  ],
  lifecycle: [
    "chainProfileAccount",
    "protocolConfigAccount",
    "sessionKeyAccount",
  ],
  fees: ["feeScheduleAccount", "feeVaultAccount"],
  swarm: ["swarmPoolAccount"],
  "address-lists": ["addressListAccount", "billingTemplate"],
};

// Check if there are unmapped accounts
const allMappedAccounts = Object.values(DOMAIN_ACCOUNTS).flat();
const idlAccountNames = idl.accounts.map((a) => toCamelCase(a.name));
const unmappedAccounts = idlAccountNames.filter(
  (name) => !allMappedAccounts.includes(name),
);
if (unmappedAccounts.length > 0) {
  console.log("Warning: Unmapped accounts in generator:", unmappedAccounts);
  // Put unmapped accounts into treasury by default
  unmappedAccounts.forEach((name) => {
    DOMAIN_ACCOUNTS.treasury.push(name);
  });
}

// Generate account domain modules
Object.keys(DOMAIN_ACCOUNTS).forEach((domain) => {
  const accounts = DOMAIN_ACCOUNTS[domain];
  if (accounts.length === 0) return;

  const lines = [
    `/** Generated account fetchers for the ${domain} domain. Do not edit. */`,
    ``,
    domain === "treasury"
      ? `import { SystemProgram, type PublicKey } from "@solana/web3.js";`
      : `import type { PublicKey } from "@solana/web3.js";`,
    `import type { IdlAccounts } from "@coral-xyz/anchor";`,
    `import type { AuraClient } from "../client.js";`,
    ...(domain === "treasury"
      ? [
          `import { AURA_PROGRAM_ID, type CreateTreasuryArgs } from "../constants.js";`,
          `import type { CreateTreasuryInput } from "../instructions/treasury.js";`,
          `import { deriveTreasuryAddress } from "../pda.js";`,
        ]
      : []),
    `import type { AuraCore } from "../generated/aura_core.js";`,
    ``,
    `type AuraAccounts = IdlAccounts<AuraCore>;`,
    ``,
  ];

  if (domain === "treasury") {
    lines.push(`export interface CreateTreasuryInputOptions {`);
    lines.push(`  owner: PublicKey;`);
    lines.push(`  args: CreateTreasuryArgs;`);
    lines.push(`  treasury?: PublicKey;`);
    lines.push(`  programId?: PublicKey;`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`export interface PreparedCreateTreasuryInput {`);
    lines.push(`  treasury: PublicKey;`);
    lines.push(`  input: CreateTreasuryInput;`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`export function derive(`);
    lines.push(`  owner: PublicKey,`);
    lines.push(`  agentId: string,`);
    lines.push(`  programId: PublicKey = AURA_PROGRAM_ID,`);
    lines.push(`): [PublicKey, number] {`);
    lines.push(`  return deriveTreasuryAddress(owner, agentId, programId);`);
    lines.push(`}`);
    lines.push(``);
    lines.push(`export function createTreasuryInput(`);
    lines.push(`  options: CreateTreasuryInputOptions,`);
    lines.push(`): PreparedCreateTreasuryInput {`);
    lines.push(`  const treasury =`);
    lines.push(`    options.treasury ??`);
    lines.push(
      `    deriveTreasuryAddress(options.owner, options.args.agentId, options.programId)[0];`,
    );
    lines.push(`  return {`);
    lines.push(`    treasury,`);
    lines.push(`    input: {`);
    lines.push(`      accounts: {`);
    lines.push(`        owner: options.owner,`);
    lines.push(`        treasury,`);
    lines.push(`        systemProgram: SystemProgram.programId,`);
    lines.push(`      },`);
    lines.push(`      args: options.args,`);
    lines.push(`    },`);
    lines.push(`  };`);
    lines.push(`}`);
    lines.push(``);
  }

  accounts.forEach((acc) => {
    // Check if account actually exists in IDL
    const exists = idl.accounts.some((a) => toCamelCase(a.name) === acc);
    if (!exists) {
      console.log(`Skipping account ${acc} as it is not in the IDL.`);
      return;
    }

    const capitalizedAcc = capitalize(acc);
    lines.push(`export type ${capitalizedAcc} = AuraAccounts["${acc}"];`);
    lines.push(``);

    lines.push(
      `/** Fetches the \`${capitalizedAcc}\` account state from the cluster. */`,
    );
    lines.push(`export async function fetch${capitalizedAcc}(`);
    lines.push(`  client: AuraClient,`);
    lines.push(`  address: PublicKey,`);
    lines.push(`): Promise<${capitalizedAcc}> {`);
    lines.push(
      `  return await client.program.account.${acc}.fetch(address) as ${capitalizedAcc};`,
    );
    lines.push(`}`);
    lines.push(``);

    lines.push(
      `/** Fetches the \`${capitalizedAcc}\` account state, or returns null if not found. */`,
    );
    lines.push(`export async function fetch${capitalizedAcc}Nullable(`);
    lines.push(`  client: AuraClient,`);
    lines.push(`  address: PublicKey,`);
    lines.push(`): Promise<${capitalizedAcc} | null> {`);
    lines.push(
      `  return await client.program.account.${acc}.fetchNullable(address) as ${capitalizedAcc} | null;`,
    );
    lines.push(`}`);
    lines.push(``);
  });

  fs.writeFileSync(
    path.join(pkgRoot, `src/accounts/${domain}.ts`),
    lines.join("\n"),
  );
});

// Generate accounts/index.ts
const accountsIndexLines = [`/** Domain-grouped account fetchers. */`, ``];
Object.keys(DOMAIN_ACCOUNTS).forEach((domain) => {
  const accounts = DOMAIN_ACCOUNTS[domain].filter((acc) =>
    idl.accounts.some((a) => toCamelCase(a.name) === acc),
  );
  if (accounts.length > 0) {
    accountsIndexLines.push(`export * from "./${domain}.js";`);
  }
});
fs.writeFileSync(
  path.join(pkgRoot, "src/accounts/index.ts"),
  accountsIndexLines.join("\n"),
);

// Generate errors
const errorCodesLines = [
  `/** Generated AURA program error codes. Do not edit. */`,
  ``,
  `export const AURA_ERROR_DEFINITIONS = [`,
];
idl.errors.forEach((err) => {
  errorCodesLines.push(
    `  { code: ${err.code}, name: "${err.name}", message: ${JSON.stringify(err.msg || "")} },`,
  );
});
errorCodesLines.push(`] as const;`);
errorCodesLines.push(``);
errorCodesLines.push(`export const AuraErrorCode = {`);
idl.errors.forEach((err) => {
  errorCodesLines.push(`  ${err.name}: ${err.code},`);
});
errorCodesLines.push(`} as const;`);
errorCodesLines.push(``);
errorCodesLines.push(
  `export type AuraErrorCodeType = typeof AuraErrorCode[keyof typeof AuraErrorCode];`,
);
fs.writeFileSync(
  path.join(pkgRoot, "src/errors/codes.ts"),
  errorCodesLines.join("\n"),
);

const errorParseLines = [
  `/** Generated utilities to parse AURA program errors. Do not edit. */`,
  ``,
  `import { AURA_ERROR_DEFINITIONS } from "./codes.js";`,
  ``,
  `export type ParsedAuraError = { code: number; name: string; message: string; cause: unknown };`,
  ``,
  `const ERRORS_BY_CODE: Map<number, typeof AURA_ERROR_DEFINITIONS[number]> = new Map(AURA_ERROR_DEFINITIONS.map((error) => [error.code, error]));`,
  ``,
  `export function getAuraErrorCode(error: unknown): number | null {`,
  `  if (typeof error === "object" && error !== null) {`,
  `    const candidate = error as { code?: unknown; error?: { errorCode?: { number?: unknown } } };`,
  `    if (typeof candidate.code === "number") return candidate.code;`,
  `    if (typeof candidate.error?.errorCode?.number === "number") return candidate.error.errorCode.number;`,
  `  }`,
  `  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";`,
  `  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);`,
  `  if (hex?.[1]) return Number.parseInt(hex[1], 16);`,
  `  return null;`,
  `}`,
  ``,
  `export function parseAuraError(error: unknown): ParsedAuraError | null {`,
  `  const code = getAuraErrorCode(error);`,
  `  if (code === null) return null;`,
  `  const definition = ERRORS_BY_CODE.get(code);`,
  `  if (!definition) return null;`,
  `  return { code, name: definition.name, message: definition.message, cause: error };`,
  `}`,
  ``,
  `export function isAuraError(error: unknown, code?: number): boolean {`,
  `  const actual = getAuraErrorCode(error);`,
  `  return actual !== null && (code === undefined || actual === code);`,
  `}`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/errors/parse.ts"),
  errorParseLines.join("\n"),
);

const errorTypesLines = [
  `/** Generated error type helper. Do not edit. */`,
  `import type { AuraCore } from "../generated/aura_core.js";`,
  `export type AuraError = AuraCore["errors"][number];`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/errors/types.ts"),
  errorTypesLines.join("\n"),
);

const errorsIndexLines = [
  `export * from "./codes.js";`,
  `export * from "./parse.js";`,
  `export * from "./types.js";`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/errors/index.ts"),
  errorsIndexLines.join("\n"),
);

// Generate events
const eventsDiscriminatorsLines = [
  `/** Generated event discriminators. Do not edit. */`,
  ``,
  `export const EventDiscriminator = {`,
];
if (idl.events) {
  idl.events.forEach((evt) => {
    const disc =
      evt.discriminator ??
      Array.from(
        crypto
          .createHash("sha256")
          .update(`event:${evt.name}`)
          .digest()
          .slice(0, 8),
      );
    eventsDiscriminatorsLines.push(
      `  ${toCamelCase(evt.name)}: Buffer.from([${disc.join(", ")}]),`,
    );
  });
}
eventsDiscriminatorsLines.push(`} as const;`);
eventsDiscriminatorsLines.push(``);
eventsDiscriminatorsLines.push(
  `export const EVENT_DISCRIMINATORS = EventDiscriminator;`,
);
fs.writeFileSync(
  path.join(pkgRoot, "src/events/discriminators.ts"),
  eventsDiscriminatorsLines.join("\n"),
);

const eventsParseLines = [
  `/** Generated event parsing utilities. Do not edit. */`,
  `import { EventParser } from "@coral-xyz/anchor";`,
  `import type { AuraEvents } from "./types.js";`,
  `import type { AuraClient } from "../client.js";`,
  ``,
  `export function parseAuraEvents(client: AuraClient, logs: string[]): AuraEvents[keyof AuraEvents][] {`,
  `  const parser = new EventParser(client.programId, client.program.coder);`,
  `  const events: AuraEvents[keyof AuraEvents][] = [];`,
  `  for (const event of parser.parseLogs(logs)) {`,
  `    events.push(event.data as AuraEvents[keyof AuraEvents]);`,
  `  }`,
  `  return events;`,
  `}`,
  ``,
  `export function matchesEventDiscriminator(data: Buffer, discriminator: Buffer): boolean {`,
  `  return data.length >= discriminator.length && data.subarray(0, discriminator.length).equals(discriminator);`,
  `}`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/events/parse.ts"),
  eventsParseLines.join("\n"),
);

const eventsTypesLines = [
  `/** Generated event types. Do not edit. */`,
  `import type { IdlEvents } from "@coral-xyz/anchor";`,
  `import type { AuraCore } from "../generated/aura_core.js";`,
  ``,
  `export type AuraEvents = IdlEvents<AuraCore>;`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/events/types.ts"),
  eventsTypesLines.join("\n"),
);

const eventsIndexLines = [
  `export * from "./discriminators.js";`,
  `export * from "./parse.js";`,
  `export * from "./types.js";`,
];
fs.writeFileSync(
  path.join(pkgRoot, "src/events/index.ts"),
  eventsIndexLines.join("\n"),
);

// Generate program-surface.ts — complete, human-facing capability catalog.
{
  const featureOrder = idl.instructions.map((ix) => ix.name);
  const byDomain = {};
  DOMAINS.forEach((d) => {
    byDomain[d] = [];
  });
  featureOrder.forEach((name) => {
    byDomain[getDomain(name)].push(name);
  });

  const q = (s) => JSON.stringify(s);
  const lines = [
    `/**`,
    ` * Canonical program-surface catalog for the current \`aura-core\` deployment.`,
    ` *`,
    ` * GENERATED by scripts/generate-sdk.js from the IDL + INSTRUCTION_DOMAINS map.`,
    ` * Do not edit by hand. Instruction names are snake_case to match the Anchor`,
    ` * IDL and on-chain logs. Apps use this metadata for navigation, capability`,
    ` * discovery, documentation, and command grouping.`,
    ` */`,
    ``,
    `export type AuraFeatureDomainId =`,
    ...DOMAIN_META.map(
      (d, i) => `  | ${q(d.id)}${i === DOMAIN_META.length - 1 ? ";" : ""}`,
    ),
  ];

  lines.push(
    ``,
    `export type AuraFeatureMaturity =`,
    `  | "wallet"`,
    `  | "backend"`,
    `  | "read_only"`,
    `  | "external_cpi";`,
    ``,
    `/** A single instruction exposed by the program, with display metadata. */`,
    `export interface AuraInstructionFeature {`,
    `  /** Anchor instruction name (snake_case). */`,
    `  name: string;`,
    `  /** Human readable command label. */`,
    `  label: string;`,
    `  /** Short operational summary. */`,
    `  description: string;`,
    `  /** How this instruction is usually driven. */`,
    `  maturity: AuraFeatureMaturity;`,
    `}`,
    ``,
    `/** A domain groups related instructions for navigation and command grouping. */`,
    `export interface AuraFeatureDomain {`,
    `  id: AuraFeatureDomainId;`,
    `  label: string;`,
    `  description: string;`,
    `  instructions: AuraInstructionFeature[];`,
    `}`,
    ``,
    `export const AURA_FEATURE_DOMAINS: AuraFeatureDomain[] = [`,
  );

  DOMAIN_META.forEach((d) => {
    lines.push(`  {`);
    lines.push(`    id: ${q(d.id)},`);
    lines.push(`    label: ${q(d.label)},`);
    lines.push(`    description: ${q(d.description)},`);
    lines.push(`    instructions: [`);
    byDomain[d.id].forEach((name) => {
      lines.push(`      {`);
      lines.push(`        name: ${q(name)},`);
      lines.push(`        label: ${q(humanizeLabel(name))},`);
      lines.push(`        description: ${q(describeInstruction(name))},`);
      lines.push(`        maturity: ${q(inferMaturity(name))},`);
      lines.push(`      },`);
    });
    lines.push(`    ],`);
    lines.push(`  },`);
  });
  lines.push(`];`);

  lines.push(
    ``,
    `/** Flat list of every instruction feature, annotated with its domain. */`,
    `export const AURA_INSTRUCTION_FEATURES: (AuraInstructionFeature & {`,
    `  domain: AuraFeatureDomainId;`,
    `  domainLabel: string;`,
    `})[] = AURA_FEATURE_DOMAINS.flatMap((domain) =>`,
    `  domain.instructions.map((instruction) => ({`,
    `    ...instruction,`,
    `    domain: domain.id,`,
    `    domainLabel: domain.label,`,
    `  })),`,
    `);`,
    ``,
    `/** Complete instruction-name -> domain id map (all ${featureOrder.length} instructions). */`,
    `export const AURA_INSTRUCTION_DOMAINS: Record<string, AuraFeatureDomainId> = {`,
    ...featureOrder.map((name) => `  ${q(name)}: ${q(getDomain(name))},`),
    `};`,
    ``,
    `/** Looks up a domain definition by id. */`,
    `export function getAuraFeatureDomain(`,
    `  id: AuraFeatureDomainId,`,
    `): AuraFeatureDomain | undefined {`,
    `  return AURA_FEATURE_DOMAINS.find((domain) => domain.id === id);`,
    `}`,
    ``,
    `/** Returns the domain id for an instruction name, or undefined if unknown. */`,
    `export function getInstructionDomain(`,
    `  name: string,`,
    `): AuraFeatureDomainId | undefined {`,
    `  return AURA_INSTRUCTION_DOMAINS[name];`,
    `}`,
    ``,
  );

  fs.writeFileSync(surfacePath, lines.join("\n"));
}

console.log("SDK code generation completed successfully!");
