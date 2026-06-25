/**
 * Generates a discoverable, fully-covering command surface from the program's
 * own metadata. For every domain in `AURA_FEATURE_DOMAINS` and every instruction
 * within it, this registers `aura <domain> <instruction>` — e.g.
 * `aura policy create-policy-template` or `aura budget configure-budget-envelope`.
 *
 * Because it is driven by the IDL + program-surface catalog, coverage never
 * drifts from the deployed program: new instructions appear automatically once
 * the SDK is regenerated. Ergonomic command groups (treasury, dwallet, ...) are
 * registered first; this generator merges generated subcommands into those same
 * groups, skipping any name an ergonomic verb already claimed.
 */

import { AURA_FEATURE_DOMAINS } from "@aura-protocol/sdk-ts";
import type { Command } from "commander";

import { style } from "../ui/theme.js";
import {
  addBuildOptions,
  execInstruction,
  instructionHelpText,
} from "./instruction-exec.js";

/** Anchor instruction names are snake_case; CLI subcommands are kebab-case. */
function toKebab(name: string): string {
  return name.replace(/_/g, "-");
}

/** Reuses an existing top-level group (e.g. an ergonomic `treasury`) or creates one. */
function findOrCreateGroup(
  program: Command,
  id: string,
  description: string,
): Command {
  const existing = program.commands.find((command) => command.name() === id);
  if (existing) {
    return existing;
  }
  return program.command(id).description(description);
}

/** True if `group` already has a subcommand using `name` (as a name or alias). */
function hasSubcommand(group: Command, name: string): boolean {
  return group.commands.some(
    (command) => command.name() === name || command.aliases().includes(name),
  );
}

/**
 * Registers the generated per-domain instruction subcommands. Must run AFTER the
 * ergonomic command groups so it can merge into them without clobbering verbs.
 */
export function registerGeneratedCommands(program: Command): void {
  for (const domain of AURA_FEATURE_DOMAINS) {
    const group = findOrCreateGroup(program, domain.id, domain.description);

    for (const feature of domain.instructions) {
      const sub = toKebab(feature.name);
      if (hasSubcommand(group, sub)) {
        continue;
      }

      const cmd = group
        .command(sub)
        .summary(feature.label)
        .description(
          `${feature.description} ${style.dim(`[${feature.maturity}]`)}`,
        );

      addBuildOptions(cmd);
      // Defer schema rendering until `--help` is actually requested.
      cmd.addHelpText("after", () => instructionHelpText(feature.name));
      cmd.action(async function generatedInstruction(this: Command) {
        await execInstruction(this, feature.name);
      });
    }
  }
}

/** Count of instructions the generator can register (for tests / diagnostics). */
export function generatedInstructionCount(): number {
  return AURA_FEATURE_DOMAINS.reduce(
    (total, domain) => total + domain.instructions.length,
    0,
  );
}
