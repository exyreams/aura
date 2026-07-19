"use client";

import {
  AuraClient,
  derivePolicyTemplateAddress,
  instructions,
  type PolicyConfigRecord,
  toBN,
} from "@aura-protocol/sdk-ts";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildPolicyConfigRecord,
  POLICY_PRESET_OPTIONS,
  type PolicyTemplateConfigFields,
  policyTemplateConfigFieldsFromRecord,
} from "@/lib/policies/policy-template-config";

export type PolicyTemplateAction = "create" | "update" | "apply" | "close";

export interface PolicyTemplateView {
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
}

export interface PolicyTransactionDetail {
  label: string;
  value: string;
  mono?: boolean;
}

export interface PolicyTemplateTransactionDraft {
  action: PolicyTemplateAction;
  title: string;
  details: PolicyTransactionDetail[];
  transaction: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  feeLamports: number | null;
  ownerAddress: string;
  templateId: string;
  templateAddress: string;
  templateName: string;
  treasuryPda: string | null;
  sourcePreset: number | null;
  shared: boolean | null;
}

interface CommonDraftInput {
  connection: Connection;
  walletAdapter: WalletContextState;
  programId?: PublicKey;
}

export interface CreatePolicyTemplateDraftInput extends CommonDraftInput {
  templateId: string;
  name: string;
  description: string;
  shared: boolean;
  sourcePreset: number | null;
  configFields: PolicyTemplateConfigFields;
}

export interface UpdatePolicyTemplateDraftInput extends CommonDraftInput {
  template: PolicyTemplateView;
  name: string;
  description: string;
  shared: boolean;
  configFields: PolicyTemplateConfigFields;
}

export interface ApplyPolicyTemplateDraftInput extends CommonDraftInput {
  template: PolicyTemplateView;
  treasuryPda: string;
  treasuryLabel: string;
}

export interface ClosePolicyTemplateDraftInput extends CommonDraftInput {
  template: PolicyTemplateView;
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

function assertWalletSigner(walletAdapter: WalletContextState) {
  if (!walletAdapter.publicKey) {
    throw new Error("Connect the owner wallet before signing policy changes.");
  }

  if (!walletAdapter.sendTransaction) {
    throw new Error("The connected wallet cannot send Solana transactions.");
  }

  return walletAdapter.publicKey;
}

function normalizeTemplateText(
  value: string,
  label: string,
  maxLength: number,
) {
  const text = value.trim();

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  if (text.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }

  return text;
}

function normalizeDescription(value: string) {
  const text = value.trim();

  if (text.length > 160) {
    throw new Error("Description must be 160 characters or fewer.");
  }

  return text;
}

function normalizeTemplateId(value: string) {
  const text = value.trim();

  if (!/^\d+$/u.test(text)) {
    throw new Error("Template ID must be a positive integer.");
  }

  if (BigInt(text) === BigInt(0)) {
    throw new Error("Template ID must be greater than zero.");
  }

  return text;
}

function templateViewFromAccount(entry: {
  publicKey: PublicKey;
  account: {
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
  };
}): PolicyTemplateView {
  const sourcePreset = entry.account.sourcePreset ?? null;

  return {
    address: entry.publicKey.toBase58(),
    owner: entry.account.owner.toBase58(),
    templateId: bnishToString(entry.account.templateId),
    name: entry.account.name,
    description: entry.account.description,
    version: entry.account.version,
    createdAt: bnishToNumber(entry.account.createdAt),
    updatedAt: bnishToNumber(entry.account.updatedAt),
    appliedCount: bnishToString(entry.account.appliedCount),
    shared: entry.account.shared,
    sourcePreset,
    sourcePresetLabel: getPresetLabel(sourcePreset),
    config: entry.account.config,
    configFields: policyTemplateConfigFieldsFromRecord(entry.account.config),
  };
}

export async function loadPolicyTemplatesForOwner({
  connection,
  owner,
  programId,
}: {
  connection: Connection;
  owner: PublicKey;
  programId?: PublicKey;
}) {
  const client = new AuraClient({ connection, programId });
  const entries = await client.program.account.policyTemplate.all();

  return entries
    .filter((entry) => entry.account.owner.equals(owner))
    .map(templateViewFromAccount)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

async function buildVersionedDraft({
  action,
  title,
  details,
  connection,
  owner,
  instructionsList,
  templateId,
  templateAddress,
  templateName,
  treasuryPda,
  sourcePreset,
  shared,
}: {
  action: PolicyTemplateAction;
  title: string;
  details: PolicyTransactionDetail[];
  connection: Connection;
  owner: PublicKey;
  instructionsList: TransactionInstruction[];
  templateId: string;
  templateAddress: PublicKey;
  templateName: string;
  treasuryPda: string | null;
  sourcePreset: number | null;
  shared: boolean | null;
}): Promise<PolicyTemplateTransactionDraft> {
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: latest.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
      ...instructionsList,
    ],
  }).compileToV0Message();
  const fee = await connection.getFeeForMessage(message, "confirmed");

  return {
    action,
    title,
    details,
    transaction: new VersionedTransaction(message),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    feeLamports: fee.value,
    ownerAddress: owner.toBase58(),
    templateId,
    templateAddress: templateAddress.toBase58(),
    templateName,
    treasuryPda,
    sourcePreset,
    shared,
  };
}

export async function buildCreatePolicyTemplateDraft({
  connection,
  walletAdapter,
  programId,
  templateId,
  name,
  description,
  shared,
  sourcePreset,
  configFields,
}: CreatePolicyTemplateDraftInput) {
  const owner = assertWalletSigner(walletAdapter);
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const normalizedName = normalizeTemplateText(name, "Template name", 48);
  const normalizedDescription = normalizeDescription(description);
  const client = new AuraClient({ connection, programId });
  const [templateAddress] = derivePolicyTemplateAddress(
    owner,
    normalizedTemplateId,
    client.programId,
  );
  const config =
    sourcePreset === null ? buildPolicyConfigRecord(configFields) : null;
  const instruction = await instructions.policy.createPolicyTemplate(client, {
    accounts: {
      owner,
      policyTemplate: templateAddress,
      systemProgram: SystemProgram.programId,
    },
    args: {
      templateId: toBN(normalizedTemplateId),
      name: normalizedName,
      description: normalizedDescription,
      shared,
      sourcePreset,
      config,
      now: toBN(Math.floor(Date.now() / 1000)),
    },
  });

  return buildVersionedDraft({
    action: "create",
    title: "Create policy template",
    details: [
      { label: "Template", value: normalizedName },
      { label: "Template ID", value: normalizedTemplateId, mono: true },
      { label: "Template PDA", value: templateAddress.toBase58(), mono: true },
      {
        label: "Policy posture",
        value:
          sourcePreset === null
            ? "Custom config"
            : (getPresetLabel(sourcePreset) ?? "Preset"),
      },
      { label: "Shared", value: shared ? "Yes" : "No" },
    ],
    connection,
    owner,
    instructionsList: [instruction],
    templateId: normalizedTemplateId,
    templateAddress,
    templateName: normalizedName,
    treasuryPda: null,
    sourcePreset,
    shared,
  });
}

export async function buildUpdatePolicyTemplateDraft({
  connection,
  walletAdapter,
  programId,
  template,
  name,
  description,
  shared,
  configFields,
}: UpdatePolicyTemplateDraftInput) {
  const owner = assertWalletSigner(walletAdapter);
  const normalizedName = normalizeTemplateText(name, "Template name", 48);
  const normalizedDescription = normalizeDescription(description);
  const client = new AuraClient({ connection, programId });
  const templateAddress = new PublicKey(template.address);
  const instruction = await instructions.policy.updatePolicyTemplate(client, {
    accounts: {
      owner,
      policyTemplate: templateAddress,
    },
    args: {
      name: normalizedName,
      description: normalizedDescription,
      shared,
      config: buildPolicyConfigRecord(configFields),
      now: toBN(Math.floor(Date.now() / 1000)),
    },
  });

  return buildVersionedDraft({
    action: "update",
    title: "Update policy template",
    details: [
      { label: "Template", value: normalizedName },
      { label: "Template ID", value: template.templateId, mono: true },
      { label: "Template PDA", value: template.address, mono: true },
      { label: "Current version", value: `v${template.version}` },
      { label: "Shared", value: shared ? "Yes" : "No" },
    ],
    connection,
    owner,
    instructionsList: [instruction],
    templateId: template.templateId,
    templateAddress,
    templateName: normalizedName,
    treasuryPda: null,
    sourcePreset: template.sourcePreset,
    shared,
  });
}

export async function buildApplyPolicyTemplateDraft({
  connection,
  walletAdapter,
  programId,
  template,
  treasuryPda,
  treasuryLabel,
}: ApplyPolicyTemplateDraftInput) {
  const owner = assertWalletSigner(walletAdapter);
  const client = new AuraClient({ connection, programId });
  const templateAddress = new PublicKey(template.address);
  const treasury = new PublicKey(treasuryPda);
  const instruction = await instructions.policy.applyPolicyTemplate(client, {
    accounts: {
      owner,
      treasury,
      policyTemplate: templateAddress,
    },
    args: {
      now: toBN(Math.floor(Date.now() / 1000)),
    },
  });

  return buildVersionedDraft({
    action: "apply",
    title: "Apply policy template",
    details: [
      { label: "Template", value: template.name },
      { label: "Template ID", value: template.templateId, mono: true },
      { label: "Target treasury", value: treasury.toBase58(), mono: true },
      { label: "Target label", value: treasuryLabel },
      { label: "Template PDA", value: template.address, mono: true },
    ],
    connection,
    owner,
    instructionsList: [instruction],
    templateId: template.templateId,
    templateAddress,
    templateName: template.name,
    treasuryPda: treasury.toBase58(),
    sourcePreset: template.sourcePreset,
    shared: template.shared,
  });
}

export async function buildClosePolicyTemplateDraft({
  connection,
  walletAdapter,
  programId,
  template,
}: ClosePolicyTemplateDraftInput) {
  const owner = assertWalletSigner(walletAdapter);
  const client = new AuraClient({ connection, programId });
  const templateAddress = new PublicKey(template.address);
  const instruction = await instructions.policy.closePolicyTemplate(client, {
    accounts: {
      owner,
      policyTemplate: templateAddress,
    },
  });

  return buildVersionedDraft({
    action: "close",
    title: "Close policy template",
    details: [
      { label: "Template", value: template.name },
      { label: "Template ID", value: template.templateId, mono: true },
      { label: "Template PDA", value: template.address, mono: true },
      { label: "Refund recipient", value: owner.toBase58(), mono: true },
    ],
    connection,
    owner,
    instructionsList: [instruction],
    templateId: template.templateId,
    templateAddress,
    templateName: template.name,
    treasuryPda: null,
    sourcePreset: template.sourcePreset,
    shared: template.shared,
  });
}

export async function simulatePolicyTemplateTransaction(
  connection: Connection,
  draft: PolicyTemplateTransactionDraft,
) {
  const simulation = await connection.simulateTransaction(draft.transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  });

  if (simulation.value.err) {
    throw new Error(
      [
        `Preflight simulation failed: ${JSON.stringify(simulation.value.err)}`,
        ...(simulation.value.logs ?? []),
      ].join("\n"),
    );
  }

  return simulation;
}
