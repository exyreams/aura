/**
 * The raw instruction surface: `aura ix` (aliases `instruction`/`instructions`).
 *
 * A power-user escape hatch that can list, inspect, build, and send ANY
 * aura-core instruction by name straight from the IDL — the universal companion
 * to the generated per-domain commands and the ergonomic verbs.
 */

import type { Command } from "commander";

import { buildCliContext } from "../core/context.js";
import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
  serializeInstructionBuild,
} from "../lib/instructions.js";
import {
  createTable,
  emitJson,
  printBanner,
  printInfo,
  printSection,
  printTable,
} from "../ui/output.js";
import { style } from "../ui/theme.js";
import {
  addBuildOptions,
  execInstruction,
  parseBuildOptions,
  printInstructionSchema,
} from "./instruction-exec.js";

export function registerInstructionCommands(program: Command): void {
  const ix = program
    .command("instruction")
    .alias("ix")
    .alias("instructions")
    .description("Build, inspect, and send any aura-core instruction by name");

  ix.command("list")
    .description("List every instruction grouped by domain")
    .option("--domain <id>", "filter to a single domain")
    .action(function instructionList() {
      const ctx = buildCliContext(this, { needsWallet: false });
      const options = this.opts() as Record<string, unknown>;
      const domainFilter =
        typeof options.domain === "string" ? options.domain : undefined;
      const catalog = getProgramInstructionCatalog();

      if (ctx.output.json) {
        emitJson(ctx.output, catalog);
        return;
      }

      printBanner(
        ctx.output,
        "Instruction Surface",
        `${catalog.totals.instructions} instructions · ${catalog.totals.domains} domains`,
      );

      const domains = domainFilter
        ? catalog.domains.filter((domain) => domain.id === domainFilter)
        : catalog.domains;
      if (domains.length === 0) {
        printInfo(
          ctx.output,
          style.warn(`No domain matches '${domainFilter}'.`),
        );
        return;
      }

      for (const domain of domains) {
        printSection(ctx.output, `${domain.label}  (${domain.id})`);
        const table = createTable(["Instruction", "Maturity"]);
        for (const entry of domain.instructions) {
          table.push([entry.name, entry.maturity.replace("_", "-")]);
        }
        printTable(ctx.output, table);
      }
    });

  ix.command("schema")
    .alias("inspect")
    .description("Show the account and argument schema for one instruction")
    .argument("<name>", "instruction name, e.g. configure_budget_envelope")
    .action(function instructionSchema(name: string) {
      const ctx = buildCliContext(this, { needsWallet: false });
      printInstructionSchema(ctx, getProgramInstructionSchema(name));
    });

  const build = ix
    .command("build")
    .description(
      "Build an instruction and print it serialized (offline — does not send)",
    )
    .argument("<name>", "instruction name");
  addBuildOptions(build);
  build.action(async function instructionBuild(name: string) {
    const ctx = buildCliContext(this, { needsWallet: false });
    const options = this.opts() as Record<string, unknown>;
    if (options.schema === true) {
      printInstructionSchema(ctx, getProgramInstructionSchema(name));
      return;
    }
    const parsed = parseBuildOptions(options);
    const built = await buildProgramInstruction(
      ctx.client,
      { instruction: name, accounts: parsed.accounts, args: parsed.args },
      { programId: ctx.programId, defaultSigner: ctx.wallet?.publicKey },
    );
    emitJson(ctx.output, serializeInstructionBuild(built));
  });

  const send = ix
    .command("send")
    .description("Build and send an instruction through the secure pipeline")
    .argument("<name>", "instruction name");
  addBuildOptions(send);
  send.action(async function instructionSend(name: string) {
    await execInstruction(this, name);
  });
}
