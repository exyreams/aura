import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Command } from "commander";

import { defaultDbPath } from "../core/control-plane/db.js";
import { emitJson, fail } from "./output.js";

export interface ConduitCliConfig {
  rpcUrl: string;
  cluster: string;
  programId: string | null;
  dashboardBaseUrl: string;
  controlPlaneBaseUrl: string;
  deviceFlowPath: string;
  dbPath: string;
  httpHost: string;
  httpPort: number;
  publicBaseUrl: string;
  corsOrigin: string;
}

export type ConduitCliConfigKey = keyof ConduitCliConfig;

export const DEFAULT_CONDUIT_CONFIG: ConduitCliConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  cluster: "devnet",
  programId: null,
  dashboardBaseUrl: "http://localhost:3100",
  controlPlaneBaseUrl: "http://127.0.0.1:8788",
  deviceFlowPath: "/control-plane/device",
  dbPath: defaultDbPath(),
  httpHost: "127.0.0.1",
  httpPort: 8788,
  publicBaseUrl: "http://127.0.0.1:8788",
  corsOrigin: "true",
};

const CONFIG_KEYS = new Set<ConduitCliConfigKey>([
  "rpcUrl",
  "cluster",
  "programId",
  "dashboardBaseUrl",
  "controlPlaneBaseUrl",
  "deviceFlowPath",
  "dbPath",
  "httpHost",
  "httpPort",
  "publicBaseUrl",
  "corsOrigin",
]);

export function getConduitConfigDir(): string {
  return path.join(homedir(), ".aura-conduit");
}

export function getConduitConfigPath(): string {
  return path.join(getConduitConfigDir(), "config.json");
}

export function readConduitConfigFile(): Partial<ConduitCliConfig> {
  const filePath = getConduitConfigPath();
  if (!existsSync(filePath)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Config file ${filePath} must contain a JSON object.`);
  }
  return normalizeConfigRecord(parsed);
}

export function writeConduitConfigFile(
  config: Partial<ConduitCliConfig>,
): string {
  const filePath = getConduitConfigPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return filePath;
}

export function resolveConduitConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConduitCliConfig {
  const file = readConduitConfigFile();
  return {
    rpcUrl:
      env.CONDUIT_RPC_URL ??
      env.SOLANA_RPC_URL ??
      file.rpcUrl ??
      DEFAULT_CONDUIT_CONFIG.rpcUrl,
    cluster:
      env.CONDUIT_CLUSTER ?? file.cluster ?? DEFAULT_CONDUIT_CONFIG.cluster,
    programId:
      env.CONDUIT_PROGRAM_ID ??
      file.programId ??
      DEFAULT_CONDUIT_CONFIG.programId,
    dashboardBaseUrl:
      env.CONDUIT_DASHBOARD_BASE_URL ??
      file.dashboardBaseUrl ??
      DEFAULT_CONDUIT_CONFIG.dashboardBaseUrl,
    controlPlaneBaseUrl:
      env.CONDUIT_CONTROL_PLANE_URL ??
      file.controlPlaneBaseUrl ??
      DEFAULT_CONDUIT_CONFIG.controlPlaneBaseUrl,
    deviceFlowPath:
      env.CONDUIT_DEVICE_FLOW_PATH ??
      file.deviceFlowPath ??
      DEFAULT_CONDUIT_CONFIG.deviceFlowPath,
    dbPath: env.CONDUIT_DB_PATH ?? file.dbPath ?? DEFAULT_CONDUIT_CONFIG.dbPath,
    httpHost:
      env.CONDUIT_HTTP_HOST ?? file.httpHost ?? DEFAULT_CONDUIT_CONFIG.httpHost,
    httpPort: parsePort(
      env.CONDUIT_HTTP_PORT,
      file.httpPort ?? DEFAULT_CONDUIT_CONFIG.httpPort,
    ),
    publicBaseUrl:
      env.CONDUIT_PUBLIC_BASE_URL ??
      file.publicBaseUrl ??
      DEFAULT_CONDUIT_CONFIG.publicBaseUrl,
    corsOrigin:
      env.CONDUIT_CORS_ORIGIN ??
      file.corsOrigin ??
      DEFAULT_CONDUIT_CONFIG.corsOrigin,
  };
}

export function registerConfigCommands(parent: Command): void {
  parent
    .command("init")
    .description("Create a local Conduit config file.")
    .option("--force", "overwrite an existing config file", false)
    .option("--json", "print machine-readable output", false)
    .action((opts: { force?: boolean; json?: boolean }) => {
      const filePath = getConduitConfigPath();
      if (existsSync(filePath) && opts.force !== true) {
        fail(
          `Config already exists at ${filePath}. Re-run with --force to overwrite.`,
          opts.json === true,
          2,
        );
      }
      writeConduitConfigFile(DEFAULT_CONDUIT_CONFIG);
      if (opts.json === true) {
        emitJson({ path: filePath, config: DEFAULT_CONDUIT_CONFIG });
        return;
      }
      process.stdout.write(`Created Conduit config at ${filePath}\n`);
    });

  const config = parent
    .command("config")
    .description("Show or edit local Conduit CLI configuration.");

  config
    .command("path")
    .description("Print the Conduit config file path.")
    .option("--json", "print machine-readable output", false)
    .action((opts: { json?: boolean }) => {
      const filePath = getConduitConfigPath();
      if (opts.json === true) {
        emitJson({ path: filePath });
        return;
      }
      process.stdout.write(`${filePath}\n`);
    });

  config
    .command("show")
    .description("Print the resolved Conduit configuration.")
    .option("--json", "print machine-readable output", false)
    .action((opts: { json?: boolean }) => {
      const resolved = resolveConduitConfig();
      if (opts.json === true) {
        emitJson(resolved);
        return;
      }
      for (const [key, value] of Object.entries(resolved)) {
        process.stdout.write(`${key.padEnd(20)} ${String(value)}\n`);
      }
    });

  config
    .command("set")
    .description("Set one config value in ~/.aura-conduit/config.json.")
    .argument("<key>", `one of: ${Array.from(CONFIG_KEYS).join(", ")}`)
    .argument("<value>", "new value")
    .option("--json", "print machine-readable output", false)
    .action((key: string, value: string, opts: { json?: boolean }) => {
      if (!CONFIG_KEYS.has(key as ConduitCliConfigKey)) {
        fail(`Unknown config key '${key}'.`, opts.json === true, 2);
      }
      const current = readConduitConfigFile();
      const next = {
        ...current,
        [key]: key === "httpPort" ? parsePort(value, 8788) : nullable(value),
      } as Partial<ConduitCliConfig>;
      const filePath = writeConduitConfigFile(next);
      if (opts.json === true) {
        emitJson({
          path: filePath,
          key,
          value: next[key as ConduitCliConfigKey],
        });
        return;
      }
      process.stdout.write(`Updated ${key} in ${filePath}\n`);
    });
}

function parsePort(raw: string | number | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid port '${raw}'.`);
  }
  return parsed;
}

function nullable(value: string): string | null {
  return value === "null" ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConfigRecord(
  raw: Record<string, unknown>,
): Partial<ConduitCliConfig> {
  return {
    rpcUrl: typeof raw.rpcUrl === "string" ? raw.rpcUrl : undefined,
    cluster: typeof raw.cluster === "string" ? raw.cluster : undefined,
    programId:
      typeof raw.programId === "string" || raw.programId === null
        ? raw.programId
        : undefined,
    dashboardBaseUrl:
      typeof raw.dashboardBaseUrl === "string"
        ? raw.dashboardBaseUrl
        : undefined,
    controlPlaneBaseUrl:
      typeof raw.controlPlaneBaseUrl === "string"
        ? raw.controlPlaneBaseUrl
        : undefined,
    deviceFlowPath:
      typeof raw.deviceFlowPath === "string" ? raw.deviceFlowPath : undefined,
    dbPath: typeof raw.dbPath === "string" ? raw.dbPath : undefined,
    httpHost: typeof raw.httpHost === "string" ? raw.httpHost : undefined,
    httpPort: typeof raw.httpPort === "number" ? raw.httpPort : undefined,
    publicBaseUrl:
      typeof raw.publicBaseUrl === "string" ? raw.publicBaseUrl : undefined,
    corsOrigin: typeof raw.corsOrigin === "string" ? raw.corsOrigin : undefined,
  };
}
