import { type PolicyConfigRecord, toBN } from "@aura-protocol/sdk-ts";
import type { Json } from "@/lib/supabase/types";

export type PolicyFailureMode = "enforce" | "warn" | "degrade" | "skip";
export type PolicyAnomalyAction =
  | "deny"
  | "flag_for_review"
  | "require_guardian_cosign";

export interface PolicyTemplateConfigFields {
  dailyLimitUsd: string;
  perTxLimitUsd: string;
  daytimeHourlyLimitUsd: string;
  nighttimeHourlyLimitUsd: string;
  velocityLimitUsd: string;
  allowedProtocolBitmap: string;
  maxSlippageBps: string;
  maxQuoteAgeSecs: string;
  maxCounterpartyRiskScore: string;
  bitcoinManualReviewThresholdUsd: string;
  sharedPoolLimitUsd: string;
  weeklyLimitUsd: string;
  monthlyLimitUsd: string;
  cooldownEnabled: boolean;
  cooldownThresholdUsd: string;
  cooldownSecs: string;
  anomalyEnabled: boolean;
  anomalyThresholdBps: string;
  anomalyMinSampleSize: string;
  anomalyAction: PolicyAnomalyAction;
  reputationHighScoreThreshold: string;
  reputationMediumScoreThreshold: string;
  reputationHighMultiplierBps: string;
  reputationLowMultiplierBps: string;
  approvalEnabled: boolean;
  approvalGuardianAboveUsd: string;
  approvalMultisigAboveUsd: string;
  approvalTimelockAboveUsd: string;
  approvalDenyAboveUsd: string;
  approvalRiskGuardianBps: string;
  approvalRiskMultisigBps: string;
  approvalRiskTimelockBps: string;
  approvalTimelockSecs: string;
  livenessRequireEncryptFreshness: boolean;
  livenessRequireDwalletFreshness: boolean;
  livenessRequireBalanceOracleFreshness: boolean;
  livenessRequireComplianceOracleFreshness: boolean;
  livenessMaxStalenessSecs: string;
  failureQuoteFreshness: PolicyFailureMode;
  failureCounterpartyRisk: PolicyFailureMode;
  failureSlippage: PolicyFailureMode;
  failureAnomaly: PolicyFailureMode;
  failureBalanceOracleStale: PolicyFailureMode;
  failureComplianceOracle: PolicyFailureMode;
  failureEncryptLiveness: PolicyFailureMode;
  failureDwalletLiveness: PolicyFailureMode;
  failureMaxFailOpenUsd: string;
  failureFailOpenWindowSecs: string;
  failureFailOpenBudgetUsd: string;
  failureFailOpenMaxPerWindow: string;
  failureStaleFallbackLimitUsd: string;
}

export interface PolicyPresetOption {
  value: number;
  label: string;
  description: string;
}

export const POLICY_PRESET_OPTIONS: PolicyPresetOption[] = [
  {
    value: 1,
    label: "Conservative DAO",
    description:
      "Tight caps, weekly and monthly guardrails, and review-first posture.",
  },
  {
    value: 2,
    label: "AI Agent Ops",
    description:
      "Balanced defaults for active agent operations with bounded degrade modes.",
  },
  {
    value: 3,
    label: "High Trust Executor",
    description: "Higher daily and per-tx ceilings for trusted automation.",
  },
  {
    value: 4,
    label: "Strict Compliance",
    description:
      "Low risk appetite with stronger liveness and review settings.",
  },
  {
    value: 5,
    label: "Integration Fast Path",
    description: "High-limit preset for test and integration clusters.",
  },
  {
    value: 6,
    label: "Trading Desk",
    description: "Fast execution with slippage and risk escalation controls.",
  },
  {
    value: 7,
    label: "Payroll Sweep",
    description: "Recurring payout posture with protocol lock-down.",
  },
  {
    value: 8,
    label: "Grant Disbursement",
    description: "Batched grants and slower-moving approval thresholds.",
  },
  {
    value: 9,
    label: "MEV Searcher",
    description: "Wide spend limits with low counterparty risk tolerance.",
  },
  {
    value: 10,
    label: "Treasury Cold Storage",
    description: "Low-volume guardrails for dormant funds.",
  },
];

export const POLICY_FAILURE_MODE_OPTIONS: Array<{
  value: PolicyFailureMode;
  label: string;
  badge: string;
}> = [
  { value: "enforce", label: "Enforce", badge: "0" },
  { value: "warn", label: "Warn", badge: "1" },
  { value: "degrade", label: "Degrade", badge: "2" },
  { value: "skip", label: "Skip", badge: "3" },
];

export const POLICY_ANOMALY_ACTION_OPTIONS: Array<{
  value: PolicyAnomalyAction;
  label: string;
  badge: string;
}> = [
  { value: "deny", label: "Deny", badge: "0" },
  { value: "flag_for_review", label: "Flag for review", badge: "1" },
  {
    value: "require_guardian_cosign",
    label: "Require guardian cosign",
    badge: "2",
  },
];

const DEFAULT_FIELDS: PolicyTemplateConfigFields = {
  dailyLimitUsd: "10000",
  perTxLimitUsd: "1000",
  daytimeHourlyLimitUsd: "2500",
  nighttimeHourlyLimitUsd: "500",
  velocityLimitUsd: "5000",
  allowedProtocolBitmap: "31",
  maxSlippageBps: "100",
  maxQuoteAgeSecs: "300",
  maxCounterpartyRiskScore: "70",
  bitcoinManualReviewThresholdUsd: "5000",
  sharedPoolLimitUsd: "",
  weeklyLimitUsd: "",
  monthlyLimitUsd: "",
  cooldownEnabled: false,
  cooldownThresholdUsd: "1000",
  cooldownSecs: "3600",
  anomalyEnabled: false,
  anomalyThresholdBps: "15000",
  anomalyMinSampleSize: "5",
  anomalyAction: "flag_for_review",
  reputationHighScoreThreshold: "80",
  reputationMediumScoreThreshold: "50",
  reputationHighMultiplierBps: "15000",
  reputationLowMultiplierBps: "7000",
  approvalEnabled: false,
  approvalGuardianAboveUsd: "2500",
  approvalMultisigAboveUsd: "7500",
  approvalTimelockAboveUsd: "15000",
  approvalDenyAboveUsd: "50000",
  approvalRiskGuardianBps: "5000",
  approvalRiskMultisigBps: "7500",
  approvalRiskTimelockBps: "9000",
  approvalTimelockSecs: "3600",
  livenessRequireEncryptFreshness: false,
  livenessRequireDwalletFreshness: false,
  livenessRequireBalanceOracleFreshness: false,
  livenessRequireComplianceOracleFreshness: false,
  livenessMaxStalenessSecs: "3600",
  failureQuoteFreshness: "enforce",
  failureCounterpartyRisk: "enforce",
  failureSlippage: "enforce",
  failureAnomaly: "enforce",
  failureBalanceOracleStale: "enforce",
  failureComplianceOracle: "enforce",
  failureEncryptLiveness: "enforce",
  failureDwalletLiveness: "enforce",
  failureMaxFailOpenUsd: "0",
  failureFailOpenWindowSecs: "0",
  failureFailOpenBudgetUsd: "0",
  failureFailOpenMaxPerWindow: "0",
  failureStaleFallbackLimitUsd: "0",
};

function cloneDefaultFields(): PolicyTemplateConfigFields {
  return { ...DEFAULT_FIELDS };
}

function sanitizeInteger(value: string, label: string, allowZero = true) {
  const trimmed = value.trim();
  if (!/^-?\d+$/u.test(trimmed)) {
    throw new Error(`${label} must be an integer.`);
  }

  const parsed = BigInt(trimmed);
  if (!allowZero && parsed <= BigInt(0)) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return parsed.toString(10);
}

function sanitizeOptionalInteger(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return sanitizeInteger(trimmed, label);
}

function readModeCode(mode: PolicyFailureMode) {
  return mode === "warn" ? 1 : mode === "degrade" ? 2 : mode === "skip" ? 3 : 0;
}

function readAnomalyCode(action: PolicyAnomalyAction) {
  return action === "flag_for_review"
    ? 1
    : action === "require_guardian_cosign"
      ? 2
      : 0;
}

function isBigNumberLike(
  value: unknown,
): value is { toString: (base?: number) => string } {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;

  return (
    !!record &&
    typeof record.toString === "function" &&
    ("words" in record || record.constructor?.name === "BN")
  );
}

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJson(item));
  }

  if (typeof value === "bigint") {
    return value.toString(10);
  }

  if (isBigNumberLike(value)) {
    return value.toString();
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const result: Record<string, Json | undefined> = {};
    for (const [key, nested] of Object.entries(objectValue)) {
      result[key] = toJson(nested);
    }
    return result;
  }

  return String(value);
}

export function defaultPolicyTemplateConfigFields() {
  return cloneDefaultFields();
}

export function policyTemplateConfigFieldsFromRecord(
  record: PolicyConfigRecord,
): PolicyTemplateConfigFields {
  return {
    dailyLimitUsd: String(record.dailyLimitUsd),
    perTxLimitUsd: String(record.perTxLimitUsd),
    daytimeHourlyLimitUsd: String(record.daytimeHourlyLimitUsd),
    nighttimeHourlyLimitUsd: String(record.nighttimeHourlyLimitUsd),
    velocityLimitUsd: String(record.velocityLimitUsd),
    allowedProtocolBitmap: String(record.allowedProtocolBitmap),
    maxSlippageBps: String(record.maxSlippageBps),
    maxQuoteAgeSecs: record.maxQuoteAgeSecs
      ? String(record.maxQuoteAgeSecs)
      : "",
    maxCounterpartyRiskScore: record.maxCounterpartyRiskScore
      ? String(record.maxCounterpartyRiskScore)
      : "",
    bitcoinManualReviewThresholdUsd: String(
      record.bitcoinManualReviewThresholdUsd,
    ),
    sharedPoolLimitUsd: record.sharedPoolLimitUsd
      ? String(record.sharedPoolLimitUsd)
      : "",
    weeklyLimitUsd: record.weeklyLimitUsd ? String(record.weeklyLimitUsd) : "",
    monthlyLimitUsd: record.monthlyLimitUsd
      ? String(record.monthlyLimitUsd)
      : "",
    cooldownEnabled: record.cooldownConfig !== null,
    cooldownThresholdUsd: record.cooldownConfig
      ? String(record.cooldownConfig.thresholdUsd)
      : DEFAULT_FIELDS.cooldownThresholdUsd,
    cooldownSecs: record.cooldownConfig
      ? String(record.cooldownConfig.cooldownSecs)
      : DEFAULT_FIELDS.cooldownSecs,
    anomalyEnabled: record.anomalyConfig !== null,
    anomalyThresholdBps: record.anomalyConfig
      ? String(record.anomalyConfig.zScoreThresholdBps)
      : DEFAULT_FIELDS.anomalyThresholdBps,
    anomalyMinSampleSize: record.anomalyConfig
      ? String(record.anomalyConfig.minSampleSize)
      : DEFAULT_FIELDS.anomalyMinSampleSize,
    anomalyAction: record.anomalyConfig
      ? record.anomalyConfig.action === 0
        ? "deny"
        : record.anomalyConfig.action === 2
          ? "require_guardian_cosign"
          : "flag_for_review"
      : DEFAULT_FIELDS.anomalyAction,
    reputationHighScoreThreshold: String(
      record.reputationPolicy.highScoreThreshold,
    ),
    reputationMediumScoreThreshold: String(
      record.reputationPolicy.mediumScoreThreshold,
    ),
    reputationHighMultiplierBps: String(
      record.reputationPolicy.highMultiplierBps,
    ),
    reputationLowMultiplierBps: String(
      record.reputationPolicy.lowMultiplierBps,
    ),
    approvalEnabled: record.approvalLadder !== null,
    approvalGuardianAboveUsd: String(
      record.approvalLadder?.guardianAboveUsd ??
        DEFAULT_FIELDS.approvalGuardianAboveUsd,
    ),
    approvalMultisigAboveUsd: String(
      record.approvalLadder?.multisigAboveUsd ??
        DEFAULT_FIELDS.approvalMultisigAboveUsd,
    ),
    approvalTimelockAboveUsd: String(
      record.approvalLadder?.timelockAboveUsd ??
        DEFAULT_FIELDS.approvalTimelockAboveUsd,
    ),
    approvalDenyAboveUsd: String(
      record.approvalLadder?.denyAboveUsd ??
        DEFAULT_FIELDS.approvalDenyAboveUsd,
    ),
    approvalRiskGuardianBps: String(
      record.approvalLadder?.riskGuardianBps ??
        DEFAULT_FIELDS.approvalRiskGuardianBps,
    ),
    approvalRiskMultisigBps: String(
      record.approvalLadder?.riskMultisigBps ??
        DEFAULT_FIELDS.approvalRiskMultisigBps,
    ),
    approvalRiskTimelockBps: String(
      record.approvalLadder?.riskTimelockBps ??
        DEFAULT_FIELDS.approvalRiskTimelockBps,
    ),
    approvalTimelockSecs: String(
      record.approvalLadder?.timelockSecs ??
        DEFAULT_FIELDS.approvalTimelockSecs,
    ),
    livenessRequireEncryptFreshness:
      record.livenessConfig.requireEncryptFreshness,
    livenessRequireDwalletFreshness:
      record.livenessConfig.requireDwalletFreshness,
    livenessRequireBalanceOracleFreshness:
      record.livenessConfig.requireBalanceOracleFreshness,
    livenessRequireComplianceOracleFreshness:
      record.livenessConfig.requireComplianceOracleFreshness,
    livenessMaxStalenessSecs: String(record.livenessConfig.maxStalenessSecs),
    failureQuoteFreshness:
      record.failureModes.quoteFreshness === 1
        ? "warn"
        : record.failureModes.quoteFreshness === 2
          ? "degrade"
          : record.failureModes.quoteFreshness === 3
            ? "skip"
            : "enforce",
    failureCounterpartyRisk:
      record.failureModes.counterpartyRisk === 1
        ? "warn"
        : record.failureModes.counterpartyRisk === 2
          ? "degrade"
          : record.failureModes.counterpartyRisk === 3
            ? "skip"
            : "enforce",
    failureSlippage:
      record.failureModes.slippage === 1
        ? "warn"
        : record.failureModes.slippage === 2
          ? "degrade"
          : record.failureModes.slippage === 3
            ? "skip"
            : "enforce",
    failureAnomaly:
      record.failureModes.anomaly === 1
        ? "warn"
        : record.failureModes.anomaly === 2
          ? "degrade"
          : record.failureModes.anomaly === 3
            ? "skip"
            : "enforce",
    failureBalanceOracleStale:
      record.failureModes.balanceOracleStale === 1
        ? "warn"
        : record.failureModes.balanceOracleStale === 2
          ? "degrade"
          : record.failureModes.balanceOracleStale === 3
            ? "skip"
            : "enforce",
    failureComplianceOracle:
      record.failureModes.complianceOracle === 1
        ? "warn"
        : record.failureModes.complianceOracle === 2
          ? "degrade"
          : record.failureModes.complianceOracle === 3
            ? "skip"
            : "enforce",
    failureEncryptLiveness:
      record.failureModes.encryptLiveness === 1
        ? "warn"
        : record.failureModes.encryptLiveness === 2
          ? "degrade"
          : record.failureModes.encryptLiveness === 3
            ? "skip"
            : "enforce",
    failureDwalletLiveness:
      record.failureModes.dwalletLiveness === 1
        ? "warn"
        : record.failureModes.dwalletLiveness === 2
          ? "degrade"
          : record.failureModes.dwalletLiveness === 3
            ? "skip"
            : "enforce",
    failureMaxFailOpenUsd: String(record.failureModes.maxFailOpenUsd),
    failureFailOpenWindowSecs: String(record.failureModes.failOpenWindowSecs),
    failureFailOpenBudgetUsd: String(record.failureModes.failOpenBudgetUsd),
    failureFailOpenMaxPerWindow: String(
      record.failureModes.failOpenMaxPerWindow,
    ),
    failureStaleFallbackLimitUsd: String(
      record.failureModes.staleFallbackLimitUsd,
    ),
  };
}

export function buildPolicyConfigRecord(
  fields: PolicyTemplateConfigFields,
): PolicyConfigRecord {
  const maxQuoteAgeSecs = sanitizeOptionalInteger(
    fields.maxQuoteAgeSecs,
    "Quote freshness age",
  );
  const maxCounterpartyRiskScore = sanitizeOptionalInteger(
    fields.maxCounterpartyRiskScore,
    "Counterparty risk score",
  );
  const sharedPoolLimitUsd = sanitizeOptionalInteger(
    fields.sharedPoolLimitUsd,
    "Shared pool limit",
  );
  const weeklyLimitUsd = sanitizeOptionalInteger(
    fields.weeklyLimitUsd,
    "Weekly limit",
  );
  const monthlyLimitUsd = sanitizeOptionalInteger(
    fields.monthlyLimitUsd,
    "Monthly limit",
  );
  const cooldownConfig =
    fields.cooldownEnabled && fields.cooldownThresholdUsd.trim()
      ? {
          thresholdUsd: toBN(
            sanitizeInteger(
              fields.cooldownThresholdUsd,
              "Cooldown threshold",
              false,
            ),
          ),
          cooldownSecs: toBN(
            sanitizeInteger(fields.cooldownSecs, "Cooldown seconds", false),
          ),
        }
      : null;

  const anomalyConfig =
    fields.anomalyEnabled && fields.anomalyThresholdBps.trim()
      ? {
          enabled: true,
          zScoreThresholdBps: toBN(
            sanitizeInteger(
              fields.anomalyThresholdBps,
              "Anomaly threshold",
              false,
            ),
          ),
          minSampleSize: Number(
            sanitizeInteger(
              fields.anomalyMinSampleSize,
              "Anomaly sample size",
              false,
            ),
          ),
          action: readAnomalyCode(fields.anomalyAction),
        }
      : null;

  const approvalLadder =
    fields.approvalEnabled && fields.approvalGuardianAboveUsd.trim()
      ? {
          guardianAboveUsd: toBN(
            sanitizeInteger(
              fields.approvalGuardianAboveUsd,
              "Guardian approval threshold",
              false,
            ),
          ),
          multisigAboveUsd: toBN(
            sanitizeInteger(
              fields.approvalMultisigAboveUsd,
              "Multisig approval threshold",
              false,
            ),
          ),
          timelockAboveUsd: toBN(
            sanitizeInteger(
              fields.approvalTimelockAboveUsd,
              "Timelock approval threshold",
              false,
            ),
          ),
          denyAboveUsd: toBN(
            sanitizeInteger(
              fields.approvalDenyAboveUsd,
              "Deny threshold",
              false,
            ),
          ),
          riskGuardianBps: Number(
            sanitizeInteger(
              fields.approvalRiskGuardianBps,
              "Guardian risk threshold",
            ),
          ),
          riskMultisigBps: Number(
            sanitizeInteger(
              fields.approvalRiskMultisigBps,
              "Multisig risk threshold",
            ),
          ),
          riskTimelockBps: Number(
            sanitizeInteger(
              fields.approvalRiskTimelockBps,
              "Timelock risk threshold",
            ),
          ),
          timelockSecs: toBN(
            sanitizeInteger(
              fields.approvalTimelockSecs,
              "Timelock seconds",
              false,
            ),
          ),
        }
      : null;

  return {
    dailyLimitUsd: toBN(
      sanitizeInteger(fields.dailyLimitUsd, "Daily limit", false),
    ),
    perTxLimitUsd: toBN(
      sanitizeInteger(fields.perTxLimitUsd, "Per-transaction limit", false),
    ),
    daytimeHourlyLimitUsd: toBN(
      sanitizeInteger(
        fields.daytimeHourlyLimitUsd,
        "Daytime hourly limit",
        false,
      ),
    ),
    nighttimeHourlyLimitUsd: toBN(
      sanitizeInteger(
        fields.nighttimeHourlyLimitUsd,
        "Nighttime hourly limit",
        false,
      ),
    ),
    velocityLimitUsd: toBN(
      sanitizeInteger(fields.velocityLimitUsd, "Velocity limit", false),
    ),
    allowedProtocolBitmap: toBN(
      sanitizeInteger(fields.allowedProtocolBitmap, "Allowed protocol bitmap"),
    ),
    maxSlippageBps: toBN(
      sanitizeInteger(fields.maxSlippageBps, "Max slippage", false),
    ),
    maxQuoteAgeSecs: maxQuoteAgeSecs ? toBN(maxQuoteAgeSecs) : null,
    maxCounterpartyRiskScore: maxCounterpartyRiskScore
      ? Number(maxCounterpartyRiskScore)
      : null,
    bitcoinManualReviewThresholdUsd: toBN(
      sanitizeInteger(
        fields.bitcoinManualReviewThresholdUsd,
        "Bitcoin review threshold",
        false,
      ),
    ),
    sharedPoolLimitUsd: sharedPoolLimitUsd ? toBN(sharedPoolLimitUsd) : null,
    weeklyLimitUsd: weeklyLimitUsd ? toBN(weeklyLimitUsd) : null,
    monthlyLimitUsd: monthlyLimitUsd ? toBN(monthlyLimitUsd) : null,
    recipientLimits: [],
    cooldownConfig,
    anomalyConfig,
    reputationPolicy: {
      highScoreThreshold: toBN(
        sanitizeInteger(
          fields.reputationHighScoreThreshold,
          "Reputation high score",
          false,
        ),
      ),
      mediumScoreThreshold: toBN(
        sanitizeInteger(
          fields.reputationMediumScoreThreshold,
          "Reputation medium score",
          false,
        ),
      ),
      highMultiplierBps: toBN(
        sanitizeInteger(
          fields.reputationHighMultiplierBps,
          "Reputation high multiplier",
          false,
        ),
      ),
      lowMultiplierBps: toBN(
        sanitizeInteger(
          fields.reputationLowMultiplierBps,
          "Reputation low multiplier",
          false,
        ),
      ),
    },
    budgetEnvelopes: [],
    approvalLadder,
    scopedPauseEntries: [],
    livenessConfig: {
      requireEncryptFreshness: fields.livenessRequireEncryptFreshness,
      requireDwalletFreshness: fields.livenessRequireDwalletFreshness,
      requireBalanceOracleFreshness:
        fields.livenessRequireBalanceOracleFreshness,
      requireComplianceOracleFreshness:
        fields.livenessRequireComplianceOracleFreshness,
      maxStalenessSecs: toBN(
        sanitizeInteger(
          fields.livenessMaxStalenessSecs,
          "Liveness max staleness",
          false,
        ),
      ),
    },
    failureModes: {
      quoteFreshness: readModeCode(fields.failureQuoteFreshness),
      counterpartyRisk: readModeCode(fields.failureCounterpartyRisk),
      slippage: readModeCode(fields.failureSlippage),
      anomaly: readModeCode(fields.failureAnomaly),
      balanceOracleStale: readModeCode(fields.failureBalanceOracleStale),
      complianceOracle: readModeCode(fields.failureComplianceOracle),
      encryptLiveness: readModeCode(fields.failureEncryptLiveness),
      dwalletLiveness: readModeCode(fields.failureDwalletLiveness),
      maxFailOpenUsd: toBN(
        sanitizeInteger(fields.failureMaxFailOpenUsd, "Fail-open max USD"),
      ),
      failOpenWindowSecs: toBN(
        sanitizeInteger(
          fields.failureFailOpenWindowSecs,
          "Fail-open window seconds",
        ),
      ),
      failOpenBudgetUsd: toBN(
        sanitizeInteger(
          fields.failureFailOpenBudgetUsd,
          "Fail-open budget USD",
        ),
      ),
      failOpenMaxPerWindow: Number(
        sanitizeInteger(
          fields.failureFailOpenMaxPerWindow,
          "Fail-open max per window",
        ),
      ),
      staleFallbackLimitUsd: toBN(
        sanitizeInteger(
          fields.failureStaleFallbackLimitUsd,
          "Stale fallback USD",
        ),
      ),
    },
  } satisfies PolicyConfigRecord;
}

export function policyConfigRecordToJson(record: PolicyConfigRecord): Json {
  return toJson(record);
}
