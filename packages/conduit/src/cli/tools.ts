import type { Command } from "commander";

import { createToolRegistry } from "../core/registry.js";
import type { Tool } from "../core/types.js";
import { emitJson, fail, printRows } from "./output.js";

export interface ToolCommandsOptions {
  readonly loadTools: () => Promise<ReadonlyArray<Tool>>;
}

export function registerToolCommands(
  parent: Command,
  options: ToolCommandsOptions,
): void {
  const tools = parent
    .command("tools")
    .description("Inspect the Conduit agent tool catalogue.");

  tools
    .command("list")
    .description("List all Conduit tools exposed through MCP and HTTP.")
    .option("--json", "print machine-readable output", false)
    .action(async (opts: { json?: boolean }) => {
      const registry = createToolRegistry(await options.loadTools());
      const list = registry.list().map(toolSummary);
      if (opts.json === true) {
        emitJson({ tools: list, total: list.length });
        return;
      }
      printRows(
        list.map((tool) => [
          tool.name,
          tool.scopes.join(",") || "-",
          tool.write ? "write" : "read",
          tool.humanReview ? "yes" : "no",
        ]),
        { header: ["tool", "scopes", "mode", "human review"] },
      );
    });

  tools
    .command("describe")
    .description("Describe one Conduit tool.")
    .argument("<name>", "tool name, e.g. aura.instruction.prepare")
    .option("--json", "print machine-readable output", false)
    .action(async (name: string, opts: { json?: boolean }) => {
      const registry = createToolRegistry(await options.loadTools());
      const tool = registry.get(name);
      if (tool === undefined) {
        fail(`Unknown tool '${name}'.`, opts.json === true, 2);
      }
      const summary = {
        ...toolSummary(tool),
        description: tool.description,
        declaredInstructions: tool.declaredInstructions,
      };
      if (opts.json === true) {
        emitJson(summary);
        return;
      }
      process.stdout.write(`${summary.name}\n`);
      process.stdout.write(`${summary.description}\n`);
      process.stdout.write(`scopes: ${summary.scopes.join(",") || "-"}\n`);
      process.stdout.write(`mode: ${summary.write ? "write" : "read"}\n`);
      process.stdout.write(
        `human review: ${summary.humanReview ? "yes" : "no"}\n`,
      );
      if (summary.declaredInstructions.length > 0) {
        process.stdout.write(
          `instructions: ${summary.declaredInstructions
            .map((entry) => entry.name)
            .join(", ")}\n`,
        );
      }
    });
}

function toolSummary(tool: Tool) {
  return {
    name: tool.name,
    scopes: [...tool.requiredScopes],
    write: tool.isWrite,
    humanReview: tool.triggersInbox || tool.proxiesOwnerSignature === true,
  };
}
