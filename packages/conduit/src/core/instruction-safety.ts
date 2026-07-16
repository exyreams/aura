type IdlAccountSafetyMeta = {
  readonly name: string;
  readonly signer?: boolean;
  readonly writable?: boolean;
};

export type InstructionSignerClass =
  | "none"
  | "owner"
  | "ai_authority"
  | "operator"
  | "guardian"
  | "payer"
  | "authority"
  | "mixed";

export type InstructionRiskLevel =
  | "read"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type InstructionHumanReview = "optional" | "recommended" | "required";

export type InstructionAgentPolicy =
  | "session_allowed"
  | "human_review_required"
  | "not_applicable";

export interface InstructionSafetyProfile {
  readonly signerClass: InstructionSignerClass;
  readonly riskLevel: InstructionRiskLevel;
  readonly humanReview: InstructionHumanReview;
  readonly agentPolicy: InstructionAgentPolicy;
  readonly reasons: readonly string[];
}

const criticalPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bemergency\b|shutdown/, "emergency availability control"],
  [/^break_glass/, "break-glass recovery authority"],
  [
    /transfer_authority|ownership_handover|nominate_successor/,
    "ownership or authority transfer",
  ],
  [/dead_mans_switch/, "dead-man switch execution"],
];

const highPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/revoke|rotate/, "revokes or rotates an authority or credential"],
  [
    /multisig|guardian|operator_role|recovery_destination|override/,
    "changes governance or access control",
  ],
  [
    /protocol_config|migrate_treasury/,
    "changes protocol or treasury configuration",
  ],
  [
    /pause_|scoped_pause|disable_confidential_guardrails/,
    "changes execution availability",
  ],
  [/confidential_guardrails/, "changes confidential policy guardrails"],
  [
    /collect_fees|withdraw_unused_fees|fee_recipient|fee_splits/,
    "moves or redirects protocol funds",
  ],
  [/remove_dwallet|remove_budget_envelope/, "removes protected on-chain state"],
];

const mediumPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/^close_/, "closes on-chain state"],
  [/^remove_/, "removes an on-chain configuration"],
  [
    /budget|limit|ladder|liveness_guardrails/,
    "changes spend or liveness policy",
  ],
  [/dwallet|deposit|spend|settlement/, "changes wallet or settlement state"],
  [/policy|trust|canary|invariant/, "changes policy evaluation state"],
  [
    /scheduled|conditional|proposal|transaction|batch|execute|finalize|trigger/,
    "changes proposal or execution state",
  ],
  [
    /session_key|agent|capability|tripwires|chain_profile/,
    "changes agent/session capability state",
  ],
  [
    /fee_schedule|fee_vault|billing|org_profile/,
    "changes billing or fee state",
  ],
  [/address_list/, "changes address-list policy state"],
];

export function classifyInstructionSafety(input: {
  readonly name: string;
  readonly accounts: readonly IdlAccountSafetyMeta[];
}): InstructionSafetyProfile {
  const signerAccounts = input.accounts
    .filter((account) => account.signer === true)
    .map((account) => account.name);
  const writableCount = input.accounts.filter(
    (account) => account.writable === true,
  ).length;
  const signerClass = classifySignerClass(signerAccounts);
  const risk = classifyRisk(input.name, writableCount);
  const agentPolicy = classifyAgentPolicy(signerClass, risk.level);
  const humanReview = classifyHumanReview(risk.level, agentPolicy);
  const reasons = [
    ...risk.reasons,
    ...signerReasons(signerAccounts, signerClass),
    ...(writableCount > 0 ? [`mutates ${writableCount} account(s)`] : []),
  ];

  return {
    signerClass,
    riskLevel: risk.level,
    humanReview,
    agentPolicy,
    reasons: reasons.length > 0 ? reasons : ["no writable account metadata"],
  };
}

function classifySignerClass(
  signerAccounts: readonly string[],
): InstructionSignerClass {
  if (signerAccounts.length === 0) {
    return "none";
  }

  const classes = new Set<Exclude<InstructionSignerClass, "none" | "mixed">>();
  for (const signer of signerAccounts) {
    classes.add(classifySignerName(signer));
  }

  if (classes.has("owner")) {
    return "owner";
  }
  if (classes.size === 1) {
    const [only] = classes;
    return only ?? "mixed";
  }
  return "mixed";
}

function classifySignerName(
  signer: string,
): Exclude<InstructionSignerClass, "none" | "mixed"> {
  if (signer === "owner") {
    return "owner";
  }
  if (signer === "ai_authority") {
    return "ai_authority";
  }
  if (signer === "operator") {
    return "operator";
  }
  if (signer === "guardian") {
    return "guardian";
  }
  if (signer === "payer" || signer === "fee_payer") {
    return "payer";
  }
  return "authority";
}

function classifyRisk(
  instructionName: string,
  writableCount: number,
): { level: InstructionRiskLevel; reasons: string[] } {
  const name = instructionName.toLowerCase();
  const critical = firstPatternReason(name, criticalPatterns);
  if (critical !== null) {
    return { level: "critical", reasons: [critical] };
  }

  const high = firstPatternReason(name, highPatterns);
  if (high !== null) {
    return { level: "high", reasons: [high] };
  }

  const medium = firstPatternReason(name, mediumPatterns);
  if (medium !== null) {
    return { level: "medium", reasons: [medium] };
  }

  if (writableCount > 0) {
    return { level: "low", reasons: ["writes program state"] };
  }
  return { level: "read", reasons: ["no writable accounts declared"] };
}

function firstPatternReason(
  value: string,
  patterns: ReadonlyArray<readonly [RegExp, string]>,
): string | null {
  for (const [pattern, reason] of patterns) {
    if (pattern.test(value)) {
      return reason;
    }
  }
  return null;
}

function classifyAgentPolicy(
  signerClass: InstructionSignerClass,
  riskLevel: InstructionRiskLevel,
): InstructionAgentPolicy {
  if (signerClass === "none" && riskLevel === "read") {
    return "not_applicable";
  }
  if (
    (signerClass === "ai_authority" || signerClass === "operator") &&
    riskLevel !== "high" &&
    riskLevel !== "critical"
  ) {
    return "session_allowed";
  }
  return "human_review_required";
}

function classifyHumanReview(
  riskLevel: InstructionRiskLevel,
  agentPolicy: InstructionAgentPolicy,
): InstructionHumanReview {
  if (
    riskLevel === "critical" ||
    riskLevel === "high" ||
    agentPolicy === "human_review_required"
  ) {
    return "required";
  }
  if (riskLevel === "medium") {
    return "recommended";
  }
  return "optional";
}

function signerReasons(
  signerAccounts: readonly string[],
  signerClass: InstructionSignerClass,
): string[] {
  if (signerAccounts.length === 0) {
    return ["no signer account declared"];
  }
  if (signerClass === "mixed") {
    return [`requires multiple signer classes: ${signerAccounts.join(", ")}`];
  }
  return [`requires ${signerClass} signer: ${signerAccounts.join(", ")}`];
}
