/**
 * Canonical program-surface catalog for the current `aura-core` deployment.
 *
 * Apps use this metadata for navigation, capability discovery, documentation,
 * and command grouping. Keep instruction names in snake_case because they map
 * directly to Anchor IDL names and on-chain logs.
 */

export type AuraFeatureDomainId =
  | "treasury"
  | "confidential"
  | "execution"
  | "governance"
  | "dwallet"
  | "policy"
  | "budget"
  | "operational"
  | "lifecycle"
  | "swarm"
  | "fees"
  | "address_lists"
  | "batch";

export type AuraFeatureMaturity = "wallet" | "backend" | "read_only" | "external_cpi";

export interface AuraInstructionFeature {
  /** Anchor instruction name. */
  name: string;
  /** Human readable command label. */
  label: string;
  /** Short operational summary. */
  description: string;
  /** How this instruction is usually driven. */
  maturity: AuraFeatureMaturity;
}

export interface AuraFeatureDomain {
  id: AuraFeatureDomainId;
  label: string;
  description: string;
  instructions: AuraInstructionFeature[];
}

export const AURA_FEATURE_DOMAINS: AuraFeatureDomain[] = [
  {
    id: "treasury",
    label: "Treasury Lifecycle",
    description: "Create, pause, resume, cancel, and configure core treasury state.",
    instructions: [
      {
        name: "create_treasury",
        label: "Create treasury",
        description: "Initializes a treasury PDA with policy and protocol-fee configuration.",
        maturity: "wallet",
      },
      {
        name: "pause_execution",
        label: "Pause execution",
        description: "Stops or resumes new proposal and execution activity.",
        maturity: "wallet",
      },
      {
        name: "cancel_pending",
        label: "Cancel pending",
        description: "Clears the active pending proposal from a treasury.",
        maturity: "wallet",
      },
      {
        name: "configure_swarm",
        label: "Configure swarm",
        description: "Attaches a treasury to a named shared spending pool.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "confidential",
    label: "Confidential Execution",
    description: "Encrypt guardrails, submit FHE proposals, and complete decryption flow.",
    instructions: [
      {
        name: "configure_confidential_guardrails",
        label: "Configure scalar guardrails",
        description: "Stores scalar encrypted daily, per-transaction, and spent-today limits.",
        maturity: "external_cpi",
      },
      {
        name: "configure_confidential_vector_guardrails",
        label: "Configure vector guardrails",
        description: "Stores vector encrypted guardrail state in one ciphertext account.",
        maturity: "external_cpi",
      },
      {
        name: "propose_confidential_transaction",
        label: "Propose confidential transaction",
        description: "Submits scalar FHE policy evaluation for a private proposal.",
        maturity: "external_cpi",
      },
      {
        name: "propose_confidential_vector_transaction",
        label: "Propose vector transaction",
        description: "Creates a pending vector proposal with heap-safe helper-vector inputs.",
        maturity: "external_cpi",
      },
      {
        name: "execute_pending_vector_fhe",
        label: "Execute vector FHE",
        description: "Runs the compact vector Encrypt graph in a separate transaction.",
        maturity: "external_cpi",
      },
      {
        name: "request_policy_decryption",
        label: "Request policy decryption",
        description: "Requests Encrypt network decryption for a policy output ciphertext.",
        maturity: "external_cpi",
      },
      {
        name: "confirm_policy_decryption",
        label: "Confirm policy decryption",
        description: "Applies decrypted policy output to the pending proposal state.",
        maturity: "backend",
      },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    description: "Create public proposals, approve them, execute dWallet signing, and finalize.",
    instructions: [
      {
        name: "propose_transaction",
        label: "Propose transaction",
        description: "Runs public policy checks and records a pending proposal.",
        maturity: "wallet",
      },
      {
        name: "approve_pending_execution",
        label: "Approve pending execution",
        description: "Records owner or guardian approval for high-risk proposals.",
        maturity: "wallet",
      },
      {
        name: "execute_pending",
        label: "Execute pending",
        description: "Drives approved or denied pending proposal execution.",
        maturity: "backend",
      },
      {
        name: "finalize_execution",
        label: "Finalize execution",
        description: "Verifies signature output and closes completed proposal state.",
        maturity: "backend",
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    description: "Multisig, overrides, authority rotation, config changes, and shutdown.",
    instructions: [
      {
        name: "configure_multisig",
        label: "Configure multisig",
        description: "Sets guardian keys and approval threshold.",
        maturity: "wallet",
      },
      {
        name: "propose_override",
        label: "Propose override",
        description: "Guardian proposes a temporary daily-limit override.",
        maturity: "wallet",
      },
      {
        name: "collect_override_signature",
        label: "Collect override signature",
        description: "Guardian cosigns an active override proposal.",
        maturity: "wallet",
      },
      {
        name: "propose_ai_rotation",
        label: "Propose AI rotation",
        description: "Owner starts the timelocked AI authority rotation flow.",
        maturity: "wallet",
      },
      {
        name: "execute_ai_rotation",
        label: "Execute AI rotation",
        description: "Completes an eligible AI authority rotation.",
        maturity: "wallet",
      },
      {
        name: "cancel_ai_rotation",
        label: "Cancel AI rotation",
        description: "Cancels a pending AI authority rotation.",
        maturity: "wallet",
      },
      {
        name: "propose_guardian_rotation",
        label: "Propose guardian rotation",
        description: "Guardian starts adding or removing a guardian.",
        maturity: "wallet",
      },
      {
        name: "execute_guardian_rotation",
        label: "Execute guardian rotation",
        description: "Completes a cosigned guardian-set change.",
        maturity: "wallet",
      },
      {
        name: "propose_config_change",
        label: "Propose config change",
        description: "Owner starts a timelocked policy configuration update.",
        maturity: "wallet",
      },
      {
        name: "execute_config_change",
        label: "Execute config change",
        description: "Applies an eligible config change.",
        maturity: "wallet",
      },
      {
        name: "veto_config_change",
        label: "Veto config change",
        description: "Guardian vetoes a pending config change inside the veto window.",
        maturity: "wallet",
      },
      {
        name: "emergency_shutdown",
        label: "Emergency shutdown",
        description: "Owner shuts down treasury activity and sets recovery authority.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "dwallet",
    label: "dWallet",
    description: "Register dWallet references and refresh balance evidence.",
    instructions: [
      {
        name: "register_dwallet",
        label: "Register dWallet",
        description: "Stores chain-specific dWallet account and signing metadata.",
        maturity: "wallet",
      },
      {
        name: "refresh_dwallet_balance",
        label: "Refresh dWallet balance",
        description: "Reads balance-oracle evidence into treasury dWallet state.",
        maturity: "backend",
      },
    ],
  },
  {
    id: "policy",
    label: "Policy Services",
    description: "Simulations, receipts, presets, attestations, history, and CPI checks.",
    instructions: [
      {
        name: "simulate_policy",
        label: "Simulate policy",
        description: "Writes a policy simulation result account.",
        maturity: "wallet",
      },
      {
        name: "write_policy_receipt",
        label: "Write policy receipt",
        description: "Persists immutable policy decision evidence.",
        maturity: "wallet",
      },
      {
        name: "apply_policy_preset",
        label: "Apply policy preset",
        description: "Applies a predefined conservative policy profile.",
        maturity: "wallet",
      },
      {
        name: "attest_policy",
        label: "Attest policy",
        description: "Stores signed policy-hash attestation.",
        maturity: "wallet",
      },
      {
        name: "check_invariants",
        label: "Check invariants",
        description: "Writes a policy and treasury invariant report.",
        maturity: "wallet",
      },
      {
        name: "check_policy_cpi",
        label: "Check policy CPI",
        description: "Creates policy decision output for external integrations.",
        maturity: "backend",
      },
      {
        name: "init_policy_history",
        label: "Init policy history",
        description: "Creates policy configuration history account.",
        maturity: "wallet",
      },
      {
        name: "record_policy_snapshot",
        label: "Record policy snapshot",
        description: "Records the current policy config into the history account.",
        maturity: "wallet",
      },
      {
        name: "close_policy_history",
        label: "Close policy history",
        description: "Closes the policy history account.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "budget",
    label: "Budgets & Liveness",
    description: "Budget envelopes, exposure groups, approval ladders, and liveness guardrails.",
    instructions: [
      {
        name: "configure_budget_envelope",
        label: "Configure budget envelope",
        description: "Creates or updates scoped budget spend controls.",
        maturity: "wallet",
      },
      {
        name: "init_exposure_group",
        label: "Init exposure group",
        description: "Initializes a cross-treasury exposure group.",
        maturity: "wallet",
      },
      {
        name: "join_exposure_group",
        label: "Join exposure group",
        description: "Adds a treasury to a shared exposure group.",
        maturity: "wallet",
      },
      {
        name: "configure_approval_ladder",
        label: "Configure approval ladder",
        description: "Sets risk thresholds for approval escalation.",
        maturity: "wallet",
      },
      {
        name: "configure_liveness_guardrails",
        label: "Configure liveness guardrails",
        description: "Requires fresh external evidence before sensitive actions.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "operational",
    label: "Operations",
    description: "Pause scopes, external liveness, health, snapshots, and activity logs.",
    instructions: [
      {
        name: "set_scoped_pause",
        label: "Set scoped pause",
        description: "Pauses one chain, tx type, protocol, recipient, or policy scope.",
        maturity: "wallet",
      },
      {
        name: "init_external_liveness",
        label: "Init external liveness",
        description: "Creates liveness evidence account for external dependencies.",
        maturity: "wallet",
      },
      {
        name: "refresh_external_liveness",
        label: "Refresh external liveness",
        description: "Updates dependency freshness timestamps.",
        maturity: "backend",
      },
      {
        name: "init_health_score",
        label: "Init health score",
        description: "Creates computed treasury health account.",
        maturity: "wallet",
      },
      {
        name: "refresh_health_score",
        label: "Refresh health score",
        description: "Updates health score from treasury state.",
        maturity: "backend",
      },
      {
        name: "close_health_score",
        label: "Close health score",
        description: "Closes the health score account.",
        maturity: "wallet",
      },
      {
        name: "take_snapshot",
        label: "Take snapshot",
        description: "Writes point-in-time treasury telemetry.",
        maturity: "wallet",
      },
      {
        name: "close_snapshot",
        label: "Close snapshot",
        description: "Closes a snapshot account.",
        maturity: "wallet",
      },
      {
        name: "init_activity_log",
        label: "Init activity log",
        description: "Creates bounded activity log storage.",
        maturity: "wallet",
      },
      {
        name: "close_activity_log",
        label: "Close activity log",
        description: "Closes the activity log account.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "lifecycle",
    label: "Lifecycle & Roles",
    description: "Agent state, migrations, operator roles, session keys, and dead-man switch.",
    instructions: [
      {
        name: "transition_agent_state",
        label: "Transition agent state",
        description: "Moves treasury agent lifecycle state.",
        maturity: "wallet",
      },
      {
        name: "migrate_treasury",
        label: "Migrate treasury",
        description: "Reallocates and bumps treasury schema version.",
        maturity: "wallet",
      },
      {
        name: "grant_operator_role",
        label: "Grant operator role",
        description: "Creates delegated operator permissions.",
        maturity: "wallet",
      },
      {
        name: "revoke_operator_role",
        label: "Revoke operator role",
        description: "Revokes delegated operator permissions.",
        maturity: "wallet",
      },
      {
        name: "issue_session_key",
        label: "Issue session key",
        description: "Creates bounded delegated proposal authority.",
        maturity: "wallet",
      },
      {
        name: "revoke_session_key",
        label: "Revoke session key",
        description: "Revokes an active session key.",
        maturity: "wallet",
      },
      {
        name: "close_session_key",
        label: "Close session key",
        description: "Closes a session key account.",
        maturity: "wallet",
      },
      {
        name: "trigger_dead_mans_switch",
        label: "Trigger dead-man switch",
        description: "Evaluates inactivity recovery state.",
        maturity: "backend",
      },
    ],
  },
  {
    id: "swarm",
    label: "Swarm Pools",
    description: "Shared agent-pool initialization and membership.",
    instructions: [
      {
        name: "init_swarm_pool",
        label: "Init swarm pool",
        description: "Creates a shared swarm spending account.",
        maturity: "wallet",
      },
      {
        name: "join_swarm",
        label: "Join swarm",
        description: "Adds a treasury to an initialized swarm pool.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "fees",
    label: "Protocol Fees",
    description: "Fee vault initialization, collection, and cleanup.",
    instructions: [
      {
        name: "init_fee_vault",
        label: "Init fee vault",
        description: "Creates treasury protocol-fee accounting vault.",
        maturity: "wallet",
      },
      {
        name: "collect_fees",
        label: "Collect fees",
        description: "Transfers accumulated protocol fees to recipient.",
        maturity: "backend",
      },
      {
        name: "close_fee_vault",
        label: "Close fee vault",
        description: "Closes an empty fee vault.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "address_lists",
    label: "Address Lists",
    description: "Allow and deny lists for recipients and contracts.",
    instructions: [
      {
        name: "init_address_list",
        label: "Init address list",
        description: "Creates a treasury address-list account.",
        maturity: "wallet",
      },
      {
        name: "manage_address_list",
        label: "Manage address list",
        description: "Replaces allow or deny entries for a chain.",
        maturity: "wallet",
      },
      {
        name: "close_address_list",
        label: "Close address list",
        description: "Closes an address-list account.",
        maturity: "wallet",
      },
    ],
  },
  {
    id: "batch",
    label: "Batch",
    description: "Batch policy simulation and proposal records.",
    instructions: [
      {
        name: "propose_batch",
        label: "Propose batch",
        description: "Writes a batch proposal/simulation account.",
        maturity: "wallet",
      },
    ],
  },
];

export const AURA_INSTRUCTION_FEATURES = AURA_FEATURE_DOMAINS.flatMap((domain) =>
  domain.instructions.map((instruction) => ({
    ...instruction,
    domain: domain.id,
    domainLabel: domain.label,
  })),
);

export function getAuraFeatureDomain(id: AuraFeatureDomainId) {
  return AURA_FEATURE_DOMAINS.find((domain) => domain.id === id);
}
