import {
  AURA_FEATURE_DOMAINS,
  AURA_INSTRUCTION_FEATURES,
  type AuraFeatureDomainId,
  type AuraFeatureMaturity,
  getAuraFeatureDomain,
} from "@aura-protocol/sdk-ts";
import type { Command } from "commander";
import { buildCliContext } from "../core/context.js";
import {
  createTable,
  emitJson,
  printBanner,
  printInfo,
  printTable,
} from "../ui/output.js";

const maturityLabels: Record<AuraFeatureMaturity, string> = {
  wallet: "wallet",
  backend: "backend",
  read_only: "read-only",
  external_cpi: "external-cpi",
};

function parseMaturity(input: unknown): AuraFeatureMaturity | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new Error("--maturity must be a string.");
  }
  const normalized = input.trim().replace("-", "_");
  if (
    normalized === "wallet" ||
    normalized === "backend" ||
    normalized === "read_only" ||
    normalized === "external_cpi"
  ) {
    return normalized;
  }
  throw new Error(
    "--maturity must be wallet, backend, read-only, or external-cpi.",
  );
}

function parseDomain(input: unknown): AuraFeatureDomainId | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input !== "string") {
    throw new Error("--domain must be a string.");
  }
  const domainId = input.trim() as AuraFeatureDomainId;
  if (!getAuraFeatureDomain(domainId)) {
    throw new Error(
      `Unknown domain '${input}'. Available domains: ${AURA_FEATURE_DOMAINS.map(
        (domain) => domain.id,
      ).join(", ")}.`,
    );
  }
  return domainId;
}

export function registerFeatureCommands(program: Command): void {
  program
    .command("features")
    .description("Inspect the latest AURA instruction and policy surface")
    .option("--domain <id>", "filter by feature domain")
    .option(
      "--maturity <kind>",
      "filter by maturity: wallet | backend | read-only | external-cpi",
    )
    .action(async function featuresList() {
      const ctx = buildCliContext(this, { needsWallet: false });
      const options = this.opts() as Record<string, unknown>;
      const domainFilter = parseDomain(options.domain);
      const maturityFilter = parseMaturity(options.maturity);
      const domains = AURA_FEATURE_DOMAINS.filter((domain) =>
        domainFilter ? domain.id === domainFilter : true,
      )
        .map((domain) => ({
          ...domain,
          instructions: domain.instructions.filter((instruction) =>
            maturityFilter ? instruction.maturity === maturityFilter : true,
          ),
        }))
        .filter((domain) => domain.instructions.length > 0);
      const instructionCount = domains.reduce(
        (total, domain) => total + domain.instructions.length,
        0,
      );

      if (ctx.output.json) {
        emitJson(ctx.output, {
          totals: {
            domains: domains.length,
            instructions: instructionCount,
            allInstructions: AURA_INSTRUCTION_FEATURES.length,
          },
          filters: {
            domain: domainFilter ?? null,
            maturity: maturityFilter ?? null,
          },
          domains,
        });
        return;
      }

      printBanner(ctx.output, "AURA Feature Surface");

      const summary = createTable([
        "Domain",
        "Instructions",
        "Wallet",
        "Backend",
        "External CPI",
      ]);
      for (const domain of domains) {
        summary.push([
          `${domain.label}\n${domain.id}`,
          domain.instructions.length.toString(),
          domain.instructions
            .filter((entry) => entry.maturity === "wallet")
            .length.toString(),
          domain.instructions
            .filter((entry) => entry.maturity === "backend")
            .length.toString(),
          domain.instructions
            .filter((entry) => entry.maturity === "external_cpi")
            .length.toString(),
        ]);
      }
      printTable(ctx.output, summary);

      for (const domain of domains) {
        printInfo(ctx.output, `\n${domain.label}`);
        const table = createTable(["Instruction", "Maturity", "Purpose"]);
        for (const instruction of domain.instructions) {
          table.push([
            instruction.name,
            maturityLabels[instruction.maturity],
            instruction.description,
          ]);
        }
        printTable(ctx.output, table);
      }
    });
}
