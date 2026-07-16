#!/usr/bin/env node
/**
 * `conduit` CLI entrypoint.
 *
 * Subcommands:
 *   conduit mcp     boot the stdio MCP server for an AI client
 *   conduit http    boot the HTTP gateway (Fastify, OpenAPI, SSE)
 *   conduit agent * device-flow login + token management + refresh
 *   conduit kill    emergency revoke-all
 *   conduit doctor  diagnose the local stack
 *   conduit audit * verify chain, anchor on-chain, tail entries
 */

import { Command } from "commander";
import { registerAgentCommands } from "../cli/agent-commands.js";
import { registerAuditCommands } from "../cli/audit.js";
import { registerConfigCommands, resolveConduitConfig } from "../cli/config.js";
import { registerDoctorCommand } from "../cli/doctor.js";
import { registerInstructionCommands } from "../cli/instructions.js";
import { registerKillCommand } from "../cli/kill.js";
import { registerMcpConfigCommand } from "../cli/mcp-config.js";
import { registerToolCommands } from "../cli/tools.js";
import { openConduitDb } from "../core/control-plane/db.js";
import { createSqliteIdempotencyStore } from "../core/control-plane/idempotency-sqlite.js";
import {
  buildSafetyHooks,
  buildToolCatalogue,
  createDbSessionResolver,
  createJsonLinesAuditLogger,
  createSolanaContext,
  createToolRegistry,
  startScheduler,
  TocTouGuard,
} from "../core/index.js";
import { InMemorySigningService } from "../core/signing/in-memory.js";
import { startHttpServer } from "../http/server.js";
import { startStdio } from "../mcp/server.js";
import { CONDUIT_VERSION } from "../version.js";

const program = new Command()
  .name("conduit")
  .description("AURA Conduit — agent-facing MCP server, HTTP gateway, and CLI")
  .version(CONDUIT_VERSION);

const defaults = resolveConduitConfig();

interface CommonOptions {
  rpcUrl: string;
  cluster: string;
  programId?: string;
  dashboardBaseUrl: string;
  dbPath?: string;
}

interface McpOptions extends CommonOptions {
  token?: string;
  account?: string;
}

function commonOptions<T extends Command>(cmd: T): T {
  return cmd
    .option("--rpc-url <url>", "Solana RPC URL", defaults.rpcUrl)
    .option("--cluster <name>", "cluster label for output", defaults.cluster)
    .option(
      "--program-id <pubkey>",
      "AURA program id (defaults to SDK's bundled id)",
      defaults.programId ?? undefined,
    )
    .option(
      "--dashboard-base-url <url>",
      "public base URL of the AURA dashboard for inbox links",
      defaults.dashboardBaseUrl,
    )
    .option(
      "--db-path <path>",
      "Conduit SQLite path (defaults to ~/.aura-conduit/conduit.db)",
      defaults.dbPath,
    ) as unknown as T;
}

const cleanups: Array<() => Promise<void>> = [];

function registerCleanup(fn: () => Promise<void>): void {
  cleanups.push(fn);
}

async function gracefulShutdown(signal: string): Promise<void> {
  process.stderr.write(`\n${signal} received, draining…\n`);
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (err) {
      process.stderr.write(`! cleanup error: ${(err as Error).message}\n`);
    }
  }
  process.exit(0);
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));

const mcpCommand = commonOptions(program.command("mcp"))
  .description(
    "Run the MCP stdio server (for Claude Code, Cursor, Codex, etc.)",
  )
  .option(
    "--token <token>",
    "Conduit bearer token; defaults to AURA_CONDUIT_TOKEN env var",
    process.env.AURA_CONDUIT_TOKEN,
  )
  .option(
    "--account <name>",
    "keychain account label (looks up the token via @napi-rs/keyring)",
  )
  .action(async (options: McpOptions) => {
    const ctx = await bootCommonContext(options);
    const sessionResolver = createDbSessionResolver(ctx.db);
    await startStdio({
      deps: ctx.deps,
      sessionResolver,
      token: options.token,
      serverName: "aura-conduit",
    });
  });

registerMcpConfigCommand(mcpCommand);

commonOptions(program.command("http"))
  .description("Run the HTTP gateway (Fastify, OpenAPI, SSE).")
  .option("--host <host>", "bind host", defaults.httpHost)
  .option<number>(
    "--port <port>",
    "bind port",
    (v: string) => Number.parseInt(v, 10),
    defaults.httpPort,
  )
  .option(
    "--public-base-url <url>",
    "URL agents use to reach this server (for OpenAPI servers field)",
    defaults.publicBaseUrl,
  )
  .option(
    "--cors-origin <value>",
    "CORS allowlist: 'true' for any, comma-separated origins, or 'false' to disable",
    defaults.corsOrigin,
  )
  .action(
    async (
      options: CommonOptions & {
        host: string;
        port: number;
        publicBaseUrl: string;
        corsOrigin: string;
      },
    ) => {
      const ctx = await bootCommonContext(options);
      const corsOrigin = parseCorsOption(options.corsOrigin);
      const fastify = await startHttpServer({
        deps: ctx.deps,
        db: ctx.db,
        publicBaseUrl: options.publicBaseUrl,
        host: options.host,
        port: options.port,
        corsOrigin,
      });
      registerCleanup(() => fastify.close());
      process.stderr.write(
        `✓ Conduit HTTP listening on ${options.host}:${options.port}\n`,
      );
    },
  );

registerConfigCommands(program);

registerInstructionCommands(program, {
  defaults: {
    rpcUrl: defaults.rpcUrl,
    cluster: defaults.cluster,
    programId: defaults.programId,
    dbPath: defaults.dbPath,
  },
  openDb: (path: string) => openConduitDb({ path }),
});

registerToolCommands(program, {
  loadTools: async () => {
    const solana = createSolanaContext({
      rpcUrl: defaults.rpcUrl,
      cluster: defaults.cluster,
      ...(defaults.programId !== null ? { programId: defaults.programId } : {}),
    });
    const db = openConduitDb({ path: defaults.dbPath });
    try {
      return buildToolCatalogue({
        solana,
        db,
        signer: new InMemorySigningService(),
        dashboardBaseUrl: defaults.dashboardBaseUrl,
      });
    } finally {
      db.close();
    }
  },
});

registerAgentCommands(program, {
  controlPlaneBaseUrl: defaults.controlPlaneBaseUrl,
  dashboardBaseUrl: defaults.dashboardBaseUrl,
});

registerKillCommand(program, {
  controlPlaneBaseUrl: defaults.controlPlaneBaseUrl,
});

registerDoctorCommand(program, {
  controlPlaneBaseUrl: defaults.controlPlaneBaseUrl,
  defaultRpcUrl: defaults.rpcUrl,
  defaultDbPath: defaults.dbPath,
});

registerAuditCommands(program, {
  controlPlaneBaseUrl: defaults.controlPlaneBaseUrl,
});

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(
    `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});

async function bootCommonContext(
  options: CommonOptions & { token?: string; account?: string },
): Promise<{
  deps: import("../core/dispatch.js").DispatchDeps;
  db: import("../core/control-plane/db.js").ConduitDb;
}> {
  if (options.account !== undefined && options.token === undefined) {
    const { createKeychainStore } = await import("../cli/keychain.js");
    const token = createKeychainStore().get(options.account);
    if (token === null) {
      process.stderr.write(
        `conduit: no token stored for keychain account '${options.account}'. ` +
          `Run \`conduit agent login --account ${options.account}\` first.\n`,
      );
      process.exit(2);
    }
    options.token = token;
  }

  const solana = createSolanaContext({
    rpcUrl: options.rpcUrl,
    cluster: options.cluster,
    ...(options.programId !== undefined
      ? { programId: options.programId }
      : {}),
  });

  const db = openConduitDb({
    ...(options.dbPath !== undefined ? { path: options.dbPath } : {}),
  });
  registerCleanup(async () => {
    db.close();
  });

  const signer = new InMemorySigningService();
  const toctou = new TocTouGuard();
  const tools = buildToolCatalogue({
    solana,
    db,
    signer,
    dashboardBaseUrl: options.dashboardBaseUrl,
    toctou,
  });
  const registry = createToolRegistry(tools);

  const idempotency = createSqliteIdempotencyStore({ db });
  const audit = createJsonLinesAuditLogger(process.stderr);
  const safety = buildSafetyHooks({ db });

  const scheduler = startScheduler({ db });
  registerCleanup(() => scheduler.stop());

  return {
    deps: { registry, audit, idempotency, safety },
    db,
  };
}

function parseCorsOption(value: string): boolean | ReadonlyArray<string> {
  if (value === "true") return true;
  if (value === "false") return false;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
