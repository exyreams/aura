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
import { registerDoctorCommand } from "../cli/doctor.js";
import { registerKillCommand } from "../cli/kill.js";
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
    .option(
      "--rpc-url <url>",
      "Solana RPC URL",
      process.env.CONDUIT_RPC_URL ?? "https://api.devnet.solana.com",
    )
    .option(
      "--cluster <name>",
      "cluster label for output",
      process.env.CONDUIT_CLUSTER ?? "devnet",
    )
    .option(
      "--program-id <pubkey>",
      "AURA program id (defaults to SDK's bundled id)",
      process.env.CONDUIT_PROGRAM_ID,
    )
    .option(
      "--dashboard-base-url <url>",
      "public base URL of the AURA dashboard for inbox links",
      process.env.CONDUIT_DASHBOARD_BASE_URL ??
        "https://auraa-protocol.vercel.app",
    )
    .option(
      "--db-path <path>",
      "Conduit SQLite path (defaults to ~/.aura-conduit/conduit.db)",
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

commonOptions(program.command("mcp"))
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

commonOptions(program.command("http"))
  .description("Run the HTTP gateway (Fastify, OpenAPI, SSE).")
  .option(
    "--host <host>",
    "bind host",
    process.env.CONDUIT_HTTP_HOST ?? "127.0.0.1",
  )
  .option<number>(
    "--port <port>",
    "bind port",
    (v: string) => Number.parseInt(v, 10),
    Number.parseInt(process.env.CONDUIT_HTTP_PORT ?? "8788", 10),
  )
  .option(
    "--public-base-url <url>",
    "URL agents use to reach this server (for OpenAPI servers field)",
    process.env.CONDUIT_PUBLIC_BASE_URL ?? "http://127.0.0.1:8788",
  )
  .option(
    "--cors-origin <value>",
    "CORS allowlist: 'true' for any, comma-separated origins, or 'false' to disable",
    process.env.CONDUIT_CORS_ORIGIN ?? "true",
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

registerAgentCommands(program, {
  controlPlaneBaseUrl:
    process.env.CONDUIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:8788",
  dashboardBaseUrl:
    process.env.CONDUIT_DASHBOARD_BASE_URL ?? "http://localhost:3100",
});

registerKillCommand(program, {
  controlPlaneBaseUrl:
    process.env.CONDUIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:8788",
});

registerDoctorCommand(program, {
  controlPlaneBaseUrl:
    process.env.CONDUIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:8788",
  defaultRpcUrl: process.env.CONDUIT_RPC_URL ?? "https://api.devnet.solana.com",
});

registerAuditCommands(program, {
  controlPlaneBaseUrl:
    process.env.CONDUIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:8788",
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
