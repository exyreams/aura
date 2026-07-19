import {
  AuraClient,
  accounts,
  type PolicyConfigRecord,
} from "@aura-protocol/sdk-ts";
import { type Connection, PublicKey } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POLICY_PRESET_OPTIONS,
  type PolicyTemplateConfigFields,
  policyConfigRecordToJson,
  policyTemplateConfigFieldsFromRecord,
} from "@/lib/policies/policy-template-config";
import type {
  Database,
  Json,
  PolicyTemplateSnapshotRow,
  TreasuryPolicySnapshotRow,
} from "@/lib/supabase/types";

export type PolicyCluster = "devnet" | "mainnet-beta";
export type PolicySnapshotAction = "create" | "update" | "apply" | "refresh";

export interface PolicyTemplateSnapshotView {
  address: string;
  owner: string;
  templateId: string;
  name: string;
  description: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  appliedCount: string;
  shared: boolean;
  sourcePreset: number | null;
  sourcePresetLabel: string | null;
  config: PolicyConfigRecord;
  configFields: PolicyTemplateConfigFields;
  cache: {
    kind: "supabase_policy_template_snapshot";
    status: PolicyTemplateSnapshotRow["status"];
    lastSyncedAt: string;
    lastTxSignature: string | null;
    lastTxSlot: number | null;
  };
}

interface PolicyTemplateAccountLike {
  owner: PublicKey;
  templateId: unknown;
  name: string;
  description: string;
  version: number;
  createdAt: unknown;
  updatedAt: unknown;
  appliedCount: unknown;
  shared: boolean;
  sourcePreset: number | null;
  config: PolicyConfigRecord;
}

interface TreasuryAccountLike {
  currentPolicyVersion?: number | null;
  policyConfig: PolicyConfigRecord;
}

interface SnapshotBaseInput {
  admin: SupabaseClient<Database>;
  ownerId: string;
  ownerWallet: string;
  cluster: PolicyCluster;
  programId: string;
}

export interface LoadPolicyTemplateSnapshotsInput extends SnapshotBaseInput {}

export interface RefreshPolicyTemplateSnapshotsInput extends SnapshotBaseInput {
  connection: Connection;
}

export interface SyncPolicyTemplateSnapshotInput extends SnapshotBaseInput {
  connection: Connection;
  templatePda: string;
  action: PolicySnapshotAction;
  signature?: string | null;
  slot?: number | null;
}

export interface ClosePolicyTemplateSnapshotInput extends SnapshotBaseInput {
  templatePda: string;
  signature: string;
  slot: number | null;
}

export interface SyncTreasuryPolicySnapshotInput extends SnapshotBaseInput {
  connection: Connection;
  treasuryPda: string;
  templatePda?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  action: PolicySnapshotAction;
  signature?: string | null;
  slot?: number | null;
}

export interface LoadTreasuryPolicySnapshotsInput extends SnapshotBaseInput {}

export interface LoadTreasuryPolicySnapshotInput {
  admin: SupabaseClient<Database>;
  ownerId: string;
  cluster: PolicyCluster;
  programId: string;
  treasuryPda: string;
}

function bnishToString(value: unknown) {
  if (typeof value === "bigint") {
    return value.toString(10);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  return String(value ?? "");
}

function bnishToNumber(value: unknown) {
  const numeric = Number(bnishToString(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getPresetLabel(sourcePreset: number | null) {
  if (sourcePreset === null) {
    return null;
  }

  return (
    POLICY_PRESET_OPTIONS.find((option) => option.value === sourcePreset)
      ?.label ?? `Preset ${sourcePreset}`
  );
}

function configFieldsToJson(fields: PolicyTemplateConfigFields): Json {
  return fields as unknown as Json;
}

function policyConfigFromJson(value: Json): PolicyConfigRecord {
  return value as unknown as PolicyConfigRecord;
}

function configFieldsFromJson(value: Json): PolicyTemplateConfigFields {
  return value as unknown as PolicyTemplateConfigFields;
}

function templateSnapshotPayload(input: {
  ownerId: string;
  ownerWallet: string;
  cluster: PolicyCluster;
  programId: string;
  templatePda: string;
  account: PolicyTemplateAccountLike;
  action: PolicySnapshotAction;
  signature?: string | null;
  slot?: number | null;
}) {
  const configFields = policyTemplateConfigFieldsFromRecord(
    input.account.config,
  );
  const snapshot: Database["public"]["Tables"]["policy_template_snapshots"]["Insert"] =
    {
      owner_id: input.ownerId,
      owner_wallet: input.ownerWallet,
      cluster: input.cluster,
      program_id: input.programId,
      template_pda: input.templatePda,
      template_id: bnishToString(input.account.templateId),
      name: input.account.name,
      description: input.account.description,
      version: input.account.version,
      onchain_created_at: bnishToNumber(input.account.createdAt),
      onchain_updated_at: bnishToNumber(input.account.updatedAt),
      applied_count: bnishToString(input.account.appliedCount),
      shared: input.account.shared,
      source_preset: input.account.sourcePreset ?? null,
      policy_config: policyConfigRecordToJson(input.account.config),
      config_fields: configFieldsToJson(configFields),
      status: "active",
      last_synced_at: new Date().toISOString(),
      closed_at: null,
      metadata: {
        version: "aura.policy_template_snapshot.v1",
        source: "aura_program",
        action: input.action,
      },
    };

  if (input.signature !== undefined) {
    snapshot.last_tx_signature = input.signature;
  }

  if (input.slot !== undefined) {
    snapshot.last_tx_slot = input.slot;
  }

  return snapshot;
}

export function policyTemplateSnapshotToView(
  row: PolicyTemplateSnapshotRow,
): PolicyTemplateSnapshotView {
  return {
    address: row.template_pda,
    owner: row.owner_wallet,
    templateId: row.template_id,
    name: row.name,
    description: row.description,
    version: row.version,
    createdAt: row.onchain_created_at ?? 0,
    updatedAt: row.onchain_updated_at ?? 0,
    appliedCount: row.applied_count,
    shared: row.shared,
    sourcePreset: row.source_preset,
    sourcePresetLabel: getPresetLabel(row.source_preset),
    config: policyConfigFromJson(row.policy_config),
    configFields: configFieldsFromJson(row.config_fields),
    cache: {
      kind: "supabase_policy_template_snapshot",
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      lastTxSignature: row.last_tx_signature,
      lastTxSlot: row.last_tx_slot,
    },
  };
}

export async function loadPolicyTemplateSnapshots({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
}: LoadPolicyTemplateSnapshotsInput) {
  const { data, error } = await admin
    .from("policy_template_snapshots")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("owner_wallet", ownerWallet)
    .eq("cluster", cluster)
    .eq("program_id", programId)
    .eq("status", "active")
    .order("onchain_updated_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(policyTemplateSnapshotToView);
}

export async function syncPolicyTemplateSnapshotFromChain({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
  connection,
  templatePda,
  action,
  signature,
  slot,
}: SyncPolicyTemplateSnapshotInput) {
  const client = new AuraClient({
    connection,
    programId: new PublicKey(programId),
  });
  const template = await accounts.fetchPolicyTemplateNullable(
    client,
    new PublicKey(templatePda),
  );

  if (!template) {
    throw new Error("Policy template account was not found on-chain.");
  }

  if (!template.owner.equals(new PublicKey(ownerWallet))) {
    throw new Error("Policy template owner does not match this account.");
  }

  const snapshot = templateSnapshotPayload({
    ownerId,
    ownerWallet,
    cluster,
    programId,
    templatePda,
    account: template as PolicyTemplateAccountLike,
    action,
    signature,
    slot,
  });
  const { data, error } = await admin
    .from("policy_template_snapshots")
    .upsert(snapshot, { onConflict: "cluster,program_id,template_pda" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return policyTemplateSnapshotToView(data);
}

export async function refreshPolicyTemplateSnapshotsFromChain({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
  connection,
}: RefreshPolicyTemplateSnapshotsInput) {
  const client = new AuraClient({
    connection,
    programId: new PublicKey(programId),
  });
  const owner = new PublicKey(ownerWallet);
  const entries = await client.program.account.policyTemplate.all();
  const snapshots = entries
    .filter((entry) => entry.account.owner.equals(owner))
    .map((entry) =>
      templateSnapshotPayload({
        ownerId,
        ownerWallet,
        cluster,
        programId,
        templatePda: entry.publicKey.toBase58(),
        account: entry.account as PolicyTemplateAccountLike,
        action: "refresh",
      }),
    );

  if (snapshots.length === 0) {
    return [];
  }

  const { error } = await admin
    .from("policy_template_snapshots")
    .upsert(snapshots, { onConflict: "cluster,program_id,template_pda" });

  if (error) {
    throw new Error(error.message);
  }

  return loadPolicyTemplateSnapshots({
    admin,
    ownerId,
    ownerWallet,
    cluster,
    programId,
  });
}

export async function closePolicyTemplateSnapshot({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
  templatePda,
  signature,
  slot,
}: ClosePolicyTemplateSnapshotInput) {
  const closedAt = new Date().toISOString();
  const { error } = await admin
    .from("policy_template_snapshots")
    .update({
      status: "closed",
      closed_at: closedAt,
      last_synced_at: closedAt,
      last_tx_signature: signature,
      last_tx_slot: slot,
      metadata: {
        version: "aura.policy_template_snapshot.v1",
        source: "aura_program",
        action: "close",
      },
    })
    .eq("owner_id", ownerId)
    .eq("owner_wallet", ownerWallet)
    .eq("cluster", cluster)
    .eq("program_id", programId)
    .eq("template_pda", templatePda);

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncTreasuryPolicySnapshotFromChain({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
  connection,
  treasuryPda,
  templatePda,
  templateId,
  templateName,
  action,
  signature,
  slot,
}: SyncTreasuryPolicySnapshotInput) {
  const client = new AuraClient({
    connection,
    programId: new PublicKey(programId),
  });
  const treasury = (await accounts.fetchTreasuryAccountNullable(
    client,
    new PublicKey(treasuryPda),
  )) as TreasuryAccountLike | null;

  if (!treasury) {
    throw new Error("Treasury policy account was not found on-chain.");
  }

  const syncedAt = new Date().toISOString();
  const snapshot: Database["public"]["Tables"]["treasury_policy_snapshots"]["Insert"] =
    {
      owner_id: ownerId,
      owner_wallet: ownerWallet,
      cluster,
      program_id: programId,
      treasury_pda: treasuryPda,
      template_pda: templatePda ?? null,
      template_id: templateId ?? null,
      template_name: templateName ?? null,
      policy_version: Number(treasury.currentPolicyVersion ?? 0),
      policy_config: policyConfigRecordToJson(treasury.policyConfig),
      status: "active",
      last_synced_at: syncedAt,
      metadata: {
        version: "aura.treasury_policy_snapshot.v1",
        source: "aura_program",
        action,
      },
    };

  if (signature !== undefined) {
    snapshot.last_tx_signature = signature;
  }

  if (slot !== undefined) {
    snapshot.last_tx_slot = slot;
  }

  const { data, error } = await admin
    .from("treasury_policy_snapshots")
    .upsert(snapshot, { onConflict: "cluster,program_id,treasury_pda" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function loadTreasuryPolicySnapshot({
  admin,
  ownerId,
  cluster,
  programId,
  treasuryPda,
}: LoadTreasuryPolicySnapshotInput): Promise<TreasuryPolicySnapshotRow | null> {
  const { data, error } = await admin
    .from("treasury_policy_snapshots")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("cluster", cluster)
    .eq("program_id", programId)
    .eq("treasury_pda", treasuryPda)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

export async function loadTreasuryPolicySnapshots({
  admin,
  ownerId,
  ownerWallet,
  cluster,
  programId,
}: LoadTreasuryPolicySnapshotsInput): Promise<TreasuryPolicySnapshotRow[]> {
  const { data, error } = await admin
    .from("treasury_policy_snapshots")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("owner_wallet", ownerWallet)
    .eq("cluster", cluster)
    .eq("program_id", programId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
