import { PublicKey } from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { createTable, emitJson, printBanner, printTable } from "../output.js";
import {
  DWALLET_DEVNET_PROGRAM_ID,
  ENCRYPT_DEVNET_PROGRAM_ID,
  deriveBatchProposalAddress,
  deriveBudgetEnvelopeAddress,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveExposureGroupAddress,
  deriveExternalLivenessAddress,
  deriveInvariantReportAddress,
  deriveMessageApprovalAddress,
  deriveOperatorRoleAddress,
  derivePolicyAttestationAddress,
  derivePolicyReceiptAddress,
  derivePolicySimulationAddress,
  deriveTreasuryAddress,
} from "../sdk.js";

type DeriveResult = {
  kind: string;
  address: PublicKey;
  bump: number;
  programId: PublicKey;
  seeds: Record<string, string>;
};

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase().replaceAll("_", "-");
}

function requireString(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)} is required`);
  }
  return value.trim();
}

function optionalString(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePubkey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid base58 public key`);
  }
}

function optionalPubkey(options: Record<string, unknown>, key: string, fallback: PublicKey): PublicKey {
  const value = optionalString(options, key);
  return value ? parsePubkey(value, key) : fallback;
}

function parseU16(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
    throw new Error(`${label} must be a u16 integer`);
  }
  return parsed;
}

function parseU64(value: string, label: string): string {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit in u64`);
  }
  return parsed.toString();
}

function idOption(options: Record<string, unknown>, specificKey: string, label: string): string {
  return parseU64(optionalString(options, specificKey) ?? requireString(options, "id"), label);
}

function parseFixedHex(value: string, bytes: number, label: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return Buffer.from(normalized, "hex");
}

function parseHexBytes(value: string, label: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must contain valid hex bytes`);
  }
  return Buffer.from(normalized, "hex");
}

function result(
  kind: string,
  programId: PublicKey,
  tuple: [PublicKey, number],
  seeds: Record<string, string>,
): DeriveResult {
  return {
    kind,
    address: tuple[0],
    bump: tuple[1],
    programId,
    seeds,
  };
}

export function registerPdaCommands(program: Command): void {
  program
    .command("pda")
    .description("Derive AURA, policy-control, dWallet, and Encrypt PDAs")
    .argument(
      "<kind>",
      "treasury | dwallet-cpi-authority | encrypt-cpi-authority | encrypt-event-authority | message-approval | policy-simulation | policy-receipt | budget-envelope | exposure-group | operator-role | external-liveness | policy-attestation | batch-proposal | invariant-report",
    )
    .option("--owner <pubkey>", "treasury owner public key")
    .option("--agent-id <id>", "treasury agent ID")
    .option("--treasury <pda>", "treasury PDA")
    .option("--authority <pubkey>", "exposure group authority public key")
    .option("--operator <pubkey>", "operator public key")
    .option("--attester <pubkey>", "policy attester public key")
    .option("--id <u64>", "generic numeric PDA identifier")
    .option("--simulation-id <u64>", "policy simulation ID")
    .option("--proposal-id <u64>", "proposal ID")
    .option("--envelope-id <u64>", "budget envelope ID")
    .option("--batch-id <u64>", "batch proposal ID")
    .option("--report-id <u64>", "invariant report ID")
    .option("--policy-version <u64>", "policy version for attestation PDA")
    .option("--group-id <hex>", "16-byte exposure group ID as hex")
    .option("--dwallet-program-id <pubkey>", "override Ika dWallet program ID")
    .option("--encrypt-program-id <pubkey>", "override Ika Encrypt program ID")
    .option("--curve <u16>", "dWallet curve code")
    .option("--signature-scheme <u16>", "dWallet signature scheme code")
    .option("--public-key-hex <hex>", "raw dWallet public key bytes")
    .option("--message-digest <hex>", "32-byte message digest")
    .option("--message-metadata-digest <hex>", "optional 32-byte message metadata digest")
    .action(function derivePda(rawKind: string) {
      const ctx = buildCliContext(this, { needsWallet: false });
      const options = this.opts() as Record<string, unknown>;
      const kind = normalizeKind(rawKind);
      const treasury = () => parsePubkey(requireString(options, "treasury"), "treasury");
      const programId = ctx.programId;

      let derived: DeriveResult;
      switch (kind) {
        case "treasury": {
          const owner = parsePubkey(requireString(options, "owner"), "owner");
          const agentId = requireString(options, "agentId");
          derived = result(kind, programId, deriveTreasuryAddress(owner, agentId, programId), {
            owner: owner.toBase58(),
            agentId,
          });
          break;
        }
        case "dwallet-cpi-authority":
          derived = result(kind, programId, deriveDwalletCpiAuthorityAddress(programId), {});
          break;
        case "encrypt-cpi-authority":
          derived = result(kind, programId, deriveEncryptCpiAuthorityAddress(programId), {});
          break;
        case "encrypt-event-authority": {
          const encryptProgramId = optionalPubkey(
            options,
            "encryptProgramId",
            ENCRYPT_DEVNET_PROGRAM_ID,
          );
          derived = result(
            kind,
            encryptProgramId,
            deriveEncryptEventAuthorityAddress(encryptProgramId),
            {},
          );
          break;
        }
        case "message-approval": {
          const dwalletProgramId = optionalPubkey(
            options,
            "dwalletProgramId",
            DWALLET_DEVNET_PROGRAM_ID,
          );
          const curve = parseU16(requireString(options, "curve"), "curve");
          const signatureScheme = parseU16(
            requireString(options, "signatureScheme"),
            "signatureScheme",
          );
          const publicKey = parseHexBytes(requireString(options, "publicKeyHex"), "publicKeyHex");
          const messageDigest = parseFixedHex(
            requireString(options, "messageDigest"),
            32,
            "messageDigest",
          );
          const metadataValue = optionalString(options, "messageMetadataDigest");
          const metadataDigest = metadataValue
            ? parseFixedHex(metadataValue, 32, "messageMetadataDigest")
            : undefined;
          derived = result(
            kind,
            dwalletProgramId,
            deriveMessageApprovalAddress(
              dwalletProgramId,
              curve,
              publicKey,
              signatureScheme,
              messageDigest,
              metadataDigest,
            ),
            {
              curve: String(curve),
              signatureScheme: String(signatureScheme),
              publicKeyHex: Buffer.from(publicKey).toString("hex"),
              messageDigest: Buffer.from(messageDigest).toString("hex"),
              messageMetadataDigest: metadataDigest
                ? Buffer.from(metadataDigest).toString("hex")
                : "",
            },
          );
          break;
        }
        case "policy-simulation": {
          const simulationId = idOption(options, "simulationId", "simulationId");
          const key = treasury();
          derived = result(
            kind,
            programId,
            derivePolicySimulationAddress(key, simulationId, programId),
            { treasury: key.toBase58(), simulationId },
          );
          break;
        }
        case "policy-receipt": {
          const proposalId = idOption(options, "proposalId", "proposalId");
          const key = treasury();
          derived = result(
            kind,
            programId,
            derivePolicyReceiptAddress(key, proposalId, programId),
            { treasury: key.toBase58(), proposalId },
          );
          break;
        }
        case "budget-envelope": {
          const envelopeId = idOption(options, "envelopeId", "envelopeId");
          const key = treasury();
          derived = result(
            kind,
            programId,
            deriveBudgetEnvelopeAddress(key, envelopeId, programId),
            { treasury: key.toBase58(), envelopeId },
          );
          break;
        }
        case "exposure-group": {
          const authority = parsePubkey(requireString(options, "authority"), "authority");
          const groupId = parseFixedHex(requireString(options, "groupId"), 16, "groupId");
          derived = result(
            kind,
            programId,
            deriveExposureGroupAddress(authority, groupId, programId),
            { authority: authority.toBase58(), groupId: Buffer.from(groupId).toString("hex") },
          );
          break;
        }
        case "operator-role": {
          const key = treasury();
          const operator = parsePubkey(requireString(options, "operator"), "operator");
          derived = result(
            kind,
            programId,
            deriveOperatorRoleAddress(key, operator, programId),
            { treasury: key.toBase58(), operator: operator.toBase58() },
          );
          break;
        }
        case "external-liveness": {
          const key = treasury();
          derived = result(kind, programId, deriveExternalLivenessAddress(key, programId), {
            treasury: key.toBase58(),
          });
          break;
        }
        case "policy-attestation": {
          const key = treasury();
          const attester = parsePubkey(requireString(options, "attester"), "attester");
          const policyVersion = parseU64(
            requireString(options, "policyVersion"),
            "policyVersion",
          );
          derived = result(
            kind,
            programId,
            derivePolicyAttestationAddress(key, attester, policyVersion, programId),
            { treasury: key.toBase58(), attester: attester.toBase58(), policyVersion },
          );
          break;
        }
        case "batch-proposal": {
          const batchId = idOption(options, "batchId", "batchId");
          const key = treasury();
          derived = result(
            kind,
            programId,
            deriveBatchProposalAddress(key, batchId, programId),
            { treasury: key.toBase58(), batchId },
          );
          break;
        }
        case "invariant-report": {
          const reportId = idOption(options, "reportId", "reportId");
          const key = treasury();
          derived = result(
            kind,
            programId,
            deriveInvariantReportAddress(key, reportId, programId),
            { treasury: key.toBase58(), reportId },
          );
          break;
        }
        default:
          throw new Error(`Unsupported PDA kind '${rawKind}'`);
      }

      if (ctx.output.json) {
        emitJson(ctx.output, derived);
        return;
      }

      printBanner(ctx.output, `PDA: ${derived.kind}`);
      const table = createTable(["Field", "Value"]);
      table.push(["Address", derived.address.toBase58()]);
      table.push(["Bump", String(derived.bump)]);
      table.push(["Program", derived.programId.toBase58()]);
      for (const [key, value] of Object.entries(derived.seeds)) {
        if (value.length > 0) {
          table.push([key, value]);
        }
      }
      printTable(ctx.output, table);
    });
}
