/**
 * `aura agent` CLI subcommands — login / status / logout / refresh / list / token / kill.
 *
 * These commands are exposed under the `conduit agent` binary today; the
 * existing `aura` CLI in `packages/cli` can re-export them once the surfaces
 * are aligned. For now, `conduit agent login` is the single source of truth.
 */

import type { Command } from "commander";

import { CONDUIT_VERSION } from "../version.js";
import { DeviceFlowClient } from "./device-client.js";
import { createKeychainStore, type TokenStore } from "./keychain.js";

export interface AgentCommandOptions {
  readonly controlPlaneBaseUrl: string;
  readonly deviceFlowPath?: string;
  readonly dashboardBaseUrl: string;
  readonly clientName?: string;
}

const DEFAULT_LOGIN_SCOPES = "read,wallet:read,policy:preview";

export function registerAgentCommands(
  parent: Command,
  options: AgentCommandOptions,
): void {
  const agent = parent
    .command("agent")
    .description("Manage Conduit AI-client sessions");

  agent
    .command("login")
    .description(
      "Device-flow login. Mints an aurak_ token and stores it in the OS keychain.",
    )
    .requiredOption(
      "--account <name>",
      "keychain account name (e.g. claude-code-laptop)",
    )
    .option(
      "--treasury <pubkey>",
      "treasury PDA this session should be scoped to",
    )
    .option(
      "--scopes <list>",
      "comma-separated scopes (default: read,wallet:read,policy:preview)",
      DEFAULT_LOGIN_SCOPES,
    )
    .option(
      "--agent-id <label>",
      "human label for the agent (default: --account)",
    )
    .option(
      "--signer-public-key <pubkey>",
      "optional signer authority public key to bind into the owner-approved session",
    )
    .option("--no-browser", "do not auto-open the browser, just print the URL")
    .action(
      async (opts: {
        account: string;
        treasury?: string;
        scopes: string;
        agentId?: string;
        signerPublicKey?: string;
        browser?: boolean;
      }) => {
        const store = createKeychainStore();
        const client = new DeviceFlowClient({
          controlPlaneBaseUrl: options.controlPlaneBaseUrl,
          deviceFlowPath: options.deviceFlowPath,
          client: options.clientName ?? `aura-cli/${CONDUIT_VERSION}`,
        });
        const code = await client.requestCode({
          requested_scopes: opts.scopes.split(",").map((s) => s.trim()),
          requested_agent_id: opts.agentId ?? opts.account,
          ...(opts.signerPublicKey !== undefined
            ? { session_public_key: opts.signerPublicKey }
            : {}),
          ...(opts.treasury !== undefined
            ? { requested_treasury: opts.treasury }
            : {}),
        });
        const verifyUrl = buildVerifyUrl(
          options.dashboardBaseUrl,
          code.verify_url,
          code.user_code,
        );
        process.stderr.write(
          `! First copy your one-time code: ${code.user_code}\n` +
            `- Open ${verifyUrl} in your browser\n`,
        );
        const handover = await client.pollForToken(code.device_code, {
          interval: code.interval,
          expires_in: code.expires_in,
        });
        store.set(opts.account, handover.token);
        process.stderr.write(
          `✓ Authentication complete.\n✓ Token stored in OS keychain as '${opts.account}'.\n`,
        );
      },
    );

  agent
    .command("status")
    .description("Show stored sessions in the OS keychain.")
    .action(async () => {
      const store = createKeychainStore();
      const accounts = store.list();
      if (accounts.length === 0) {
        process.stdout.write(
          "(no sessions stored. run `conduit agent login` to add one.)\n",
        );
        return;
      }
      for (const account of accounts) {
        const token = store.get(account);
        const hint = token !== null ? `${token.slice(0, 12)}…` : "(missing!)";
        process.stdout.write(`* ${account.padEnd(28)} ${hint}\n`);
      }
    });

  agent
    .command("logout")
    .description(
      "Remove a session from the OS keychain (does NOT revoke on-chain).",
    )
    .requiredOption("--account <name>", "keychain account name")
    .action(async (opts: { account: string }) => {
      const store = createKeychainStore();
      const removed = store.delete(opts.account);
      process.stderr.write(
        removed
          ? `✓ Removed keychain entry '${opts.account}'.\n`
          : `! No keychain entry named '${opts.account}'.\n`,
      );
    });

  agent
    .command("token")
    .description("Print the token for an account (for scripting).")
    .requiredOption("--account <name>", "keychain account name")
    .option("--allow-unsafe", "required to actually print the token", false)
    .action(async (opts: { account: string; allowUnsafe?: boolean }) => {
      if (opts.allowUnsafe !== true) {
        process.stderr.write(
          "! Refusing to print token. Pass --allow-unsafe if you really want it on stdout.\n",
        );
        process.exit(2);
        return;
      }
      const store: TokenStore = createKeychainStore();
      const token = store.get(opts.account);
      if (token === null) {
        process.stderr.write(
          `! No token stored for account '${opts.account}'.\n`,
        );
        process.exit(2);
        return;
      }
      process.stdout.write(`${token}\n`);
    });

  agent
    .command("list")
    .description("List active sessions on the control-plane for a given owner.")
    .requiredOption("--owner <pubkey>", "treasury owner pubkey")
    .action(async (opts: { owner: string }) => {
      const res = await fetch(
        `${options.controlPlaneBaseUrl.replace(/\/$/, "")}/control-plane/sessions/owner/${opts.owner}`,
      );
      if (!res.ok) {
        process.stderr.write(`! HTTP ${res.status} from control-plane\n`);
        process.exit(1);
        return;
      }
      const body = (await res.json()) as {
        sessions: ReadonlyArray<Record<string, unknown>>;
      };
      for (const s of body.sessions) {
        process.stdout.write(`${JSON.stringify(s)}\n`);
      }
    });

  agent
    .command("refresh")
    .description(
      "Re-run the device flow for an existing keychain account, replacing the token.",
    )
    .requiredOption("--account <name>", "keychain account name to refresh")
    .option(
      "--treasury <pubkey>",
      "treasury PDA this session should be scoped to",
    )
    .option(
      "--scopes <list>",
      "comma-separated scopes (default: read,wallet:read,policy:preview)",
      DEFAULT_LOGIN_SCOPES,
    )
    .option("--agent-id <label>", "human label for the agent")
    .action(
      async (opts: {
        account: string;
        treasury?: string;
        scopes: string;
        agentId?: string;
      }) => {
        const store = createKeychainStore();
        const client = new DeviceFlowClient({
          controlPlaneBaseUrl: options.controlPlaneBaseUrl,
          deviceFlowPath: options.deviceFlowPath,
          client: options.clientName ?? `aura-cli/${CONDUIT_VERSION}`,
        });
        const code = await client.requestCode({
          requested_scopes: opts.scopes.split(",").map((s) => s.trim()),
          requested_agent_id: opts.agentId ?? opts.account,
          ...(opts.treasury !== undefined
            ? { requested_treasury: opts.treasury }
            : {}),
        });
        const verifyUrl = buildVerifyUrl(
          options.dashboardBaseUrl,
          code.verify_url,
          code.user_code,
        );
        process.stderr.write(
          `! Refresh code: ${code.user_code}\n` + `- Open ${verifyUrl}\n`,
        );
        const handover = await client.pollForToken(code.device_code, {
          interval: code.interval,
          expires_in: code.expires_in,
        });
        const previous = store.get(opts.account);
        store.set(opts.account, handover.token);
        process.stderr.write(
          `✓ Refresh complete.\n${previous !== null ? "  Previous token replaced.\n" : ""}` +
            "  Remember to revoke the old on-chain session key via the dashboard.\n",
        );
      },
    );
}

function buildVerifyUrl(
  dashboardBaseUrl: string,
  verifyUrl: string,
  userCode: string,
): string {
  const base = dashboardBaseUrl.replace(/\/$/, "");
  const url = /^https?:\/\//i.test(verifyUrl)
    ? new URL(verifyUrl)
    : new URL(`${base}${verifyUrl.startsWith("/") ? "" : "/"}${verifyUrl}`);

  if (!url.searchParams.has("code")) {
    url.searchParams.set("code", userCode);
  }

  return url.toString();
}
