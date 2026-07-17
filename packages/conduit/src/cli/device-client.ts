/**
 * Client-side device-flow polling — used by `aura agent login`.
 *
 * Talks to a Conduit control-plane HTTP base URL. Returns the final token
 * to the caller (which writes it to the OS keychain).
 */

import { setTimeout as sleep } from "node:timers/promises";

export interface DeviceFlowClientOptions {
  readonly controlPlaneBaseUrl: string;
  readonly deviceFlowPath?: string;
  readonly client: string;
  readonly fetchImpl?: typeof fetch;
}

export interface DeviceCodeResponse {
  readonly device_code: string;
  readonly user_code: string;
  readonly verify_url: string;
  readonly interval: number;
  readonly expires_in: number;
}

export interface TokenHandover {
  readonly token: string;
  readonly session_id: string;
}

export class DeviceFlowClient {
  private readonly base: string;
  private readonly deviceFlowPath: string;
  private readonly client: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeviceFlowClientOptions) {
    this.base = options.controlPlaneBaseUrl.replace(/\/$/, "");
    this.deviceFlowPath = normalizeDeviceFlowPath(options.deviceFlowPath);
    this.client = options.client;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async requestCode(params: {
    requested_scopes: ReadonlyArray<string>;
    requested_agent_id: string;
    session_public_key?: string;
    requested_treasury?: string;
    requested_caps?: Record<string, unknown>;
  }): Promise<DeviceCodeResponse> {
    const res = await this.fetchImpl(this.deviceUrl("code"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: this.client, ...params }),
    });
    if (!res.ok) throw new Error(`device/code failed: ${res.status}`);
    return (await res.json()) as DeviceCodeResponse;
  }

  async pollForToken(
    deviceCode: string,
    options: { interval: number; expires_in: number },
  ): Promise<TokenHandover> {
    const deadline = Date.now() + options.expires_in * 1000;
    while (Date.now() < deadline) {
      await sleep(options.interval * 1000);
      const res = await this.fetchImpl(this.deviceUrl("token"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
      });
      if (res.status === 202) continue;
      if (res.status === 410) throw new Error("device code expired");
      if (res.status === 403) throw new Error("authorization denied");
      if (!res.ok) throw new Error(`token poll failed: ${res.status}`);
      const body = (await res.json()) as {
        status: string;
        session_id?: string;
        token?: string;
        handover_url?: string;
      };
      if (
        body.status === "authorized" &&
        typeof body.session_id === "string" &&
        typeof body.token === "string"
      ) {
        return { session_id: body.session_id, token: body.token };
      }
      if (body.status === "authorized" && body.handover_url !== undefined) {
        const handover = await this.fetchImpl(
          `${this.base}${body.handover_url}`,
          { method: "POST" },
        );
        if (!handover.ok)
          throw new Error(`handover failed: ${handover.status}`);
        const handoverBody = (await handover.json()) as TokenHandover;
        return handoverBody;
      }
    }
    throw new Error("device code expired before authorization");
  }

  private deviceUrl(endpoint: "code" | "token"): string {
    return `${this.base}${this.deviceFlowPath}/${endpoint}`;
  }
}

function normalizeDeviceFlowPath(path: string | undefined): string {
  const raw = path?.trim() || "/control-plane/device";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
