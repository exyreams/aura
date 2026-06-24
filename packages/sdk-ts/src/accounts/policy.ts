/** Generated account fetchers for the policy domain. Do not edit. */

import type { IdlAccounts } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { AuraClient } from "../client.js";
import type { AuraCore } from "../generated/aura_core.js";

type AuraAccounts = IdlAccounts<AuraCore>;

export type PolicyAttestationAccount = AuraAccounts["policyAttestationAccount"];

/** Fetches the `PolicyAttestationAccount` account state from the cluster. */
export async function fetchPolicyAttestationAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyAttestationAccount> {
  return (await client.program.account.policyAttestationAccount.fetch(
    address,
  )) as PolicyAttestationAccount;
}

/** Fetches the `PolicyAttestationAccount` account state, or returns null if not found. */
export async function fetchPolicyAttestationAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyAttestationAccount | null> {
  return (await client.program.account.policyAttestationAccount.fetchNullable(
    address,
  )) as PolicyAttestationAccount | null;
}

export type PolicyCanaryAccount = AuraAccounts["policyCanaryAccount"];

/** Fetches the `PolicyCanaryAccount` account state from the cluster. */
export async function fetchPolicyCanaryAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyCanaryAccount> {
  return (await client.program.account.policyCanaryAccount.fetch(
    address,
  )) as PolicyCanaryAccount;
}

/** Fetches the `PolicyCanaryAccount` account state, or returns null if not found. */
export async function fetchPolicyCanaryAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyCanaryAccount | null> {
  return (await client.program.account.policyCanaryAccount.fetchNullable(
    address,
  )) as PolicyCanaryAccount | null;
}

export type PolicyCheckResult = AuraAccounts["policyCheckResult"];

/** Fetches the `PolicyCheckResult` account state from the cluster. */
export async function fetchPolicyCheckResult(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyCheckResult> {
  return (await client.program.account.policyCheckResult.fetch(
    address,
  )) as PolicyCheckResult;
}

/** Fetches the `PolicyCheckResult` account state, or returns null if not found. */
export async function fetchPolicyCheckResultNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyCheckResult | null> {
  return (await client.program.account.policyCheckResult.fetchNullable(
    address,
  )) as PolicyCheckResult | null;
}

export type PolicyHistoryAccount = AuraAccounts["policyHistoryAccount"];

/** Fetches the `PolicyHistoryAccount` account state from the cluster. */
export async function fetchPolicyHistoryAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyHistoryAccount> {
  return (await client.program.account.policyHistoryAccount.fetch(
    address,
  )) as PolicyHistoryAccount;
}

/** Fetches the `PolicyHistoryAccount` account state, or returns null if not found. */
export async function fetchPolicyHistoryAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyHistoryAccount | null> {
  return (await client.program.account.policyHistoryAccount.fetchNullable(
    address,
  )) as PolicyHistoryAccount | null;
}

export type PolicyReceiptAccount = AuraAccounts["policyReceiptAccount"];

/** Fetches the `PolicyReceiptAccount` account state from the cluster. */
export async function fetchPolicyReceiptAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyReceiptAccount> {
  return (await client.program.account.policyReceiptAccount.fetch(
    address,
  )) as PolicyReceiptAccount;
}

/** Fetches the `PolicyReceiptAccount` account state, or returns null if not found. */
export async function fetchPolicyReceiptAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyReceiptAccount | null> {
  return (await client.program.account.policyReceiptAccount.fetchNullable(
    address,
  )) as PolicyReceiptAccount | null;
}

export type PolicySimulationResultAccount =
  AuraAccounts["policySimulationResultAccount"];

/** Fetches the `PolicySimulationResultAccount` account state from the cluster. */
export async function fetchPolicySimulationResultAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicySimulationResultAccount> {
  return (await client.program.account.policySimulationResultAccount.fetch(
    address,
  )) as PolicySimulationResultAccount;
}

/** Fetches the `PolicySimulationResultAccount` account state, or returns null if not found. */
export async function fetchPolicySimulationResultAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicySimulationResultAccount | null> {
  return (await client.program.account.policySimulationResultAccount.fetchNullable(
    address,
  )) as PolicySimulationResultAccount | null;
}

export type PolicyTemplate = AuraAccounts["policyTemplate"];

/** Fetches the `PolicyTemplate` account state from the cluster. */
export async function fetchPolicyTemplate(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyTemplate> {
  return (await client.program.account.policyTemplate.fetch(
    address,
  )) as PolicyTemplate;
}

/** Fetches the `PolicyTemplate` account state, or returns null if not found. */
export async function fetchPolicyTemplateNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<PolicyTemplate | null> {
  return (await client.program.account.policyTemplate.fetchNullable(
    address,
  )) as PolicyTemplate | null;
}

export type TrustIdentityAccount = AuraAccounts["trustIdentityAccount"];

/** Fetches the `TrustIdentityAccount` account state from the cluster. */
export async function fetchTrustIdentityAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<TrustIdentityAccount> {
  return (await client.program.account.trustIdentityAccount.fetch(
    address,
  )) as TrustIdentityAccount;
}

/** Fetches the `TrustIdentityAccount` account state, or returns null if not found. */
export async function fetchTrustIdentityAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<TrustIdentityAccount | null> {
  return (await client.program.account.trustIdentityAccount.fetchNullable(
    address,
  )) as TrustIdentityAccount | null;
}

export type ComplianceOracleAccount = AuraAccounts["complianceOracleAccount"];

/** Fetches the `ComplianceOracleAccount` account state from the cluster. */
export async function fetchComplianceOracleAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<ComplianceOracleAccount> {
  return (await client.program.account.complianceOracleAccount.fetch(
    address,
  )) as ComplianceOracleAccount;
}

/** Fetches the `ComplianceOracleAccount` account state, or returns null if not found. */
export async function fetchComplianceOracleAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<ComplianceOracleAccount | null> {
  return (await client.program.account.complianceOracleAccount.fetchNullable(
    address,
  )) as ComplianceOracleAccount | null;
}

export type InvariantReportAccount = AuraAccounts["invariantReportAccount"];

/** Fetches the `InvariantReportAccount` account state from the cluster. */
export async function fetchInvariantReportAccount(
  client: AuraClient,
  address: PublicKey,
): Promise<InvariantReportAccount> {
  return (await client.program.account.invariantReportAccount.fetch(
    address,
  )) as InvariantReportAccount;
}

/** Fetches the `InvariantReportAccount` account state, or returns null if not found. */
export async function fetchInvariantReportAccountNullable(
  client: AuraClient,
  address: PublicKey,
): Promise<InvariantReportAccount | null> {
  return (await client.program.account.invariantReportAccount.fetchNullable(
    address,
  )) as InvariantReportAccount | null;
}
