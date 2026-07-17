import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeviceFlowClient } from "../src/cli/device-client.js";

test("device client accepts direct token handoff from control-plane", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  let pollCount = 0;
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : null,
    });
    if (url.endsWith("/control-plane/device/code")) {
      return jsonResponse({
        device_code: "dev_123",
        user_code: "ABCD-1234",
        verify_url: "/agents/device",
        interval: 0,
        expires_in: 2,
      });
    }
    if (url.endsWith("/control-plane/device/token")) {
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({ status: "pending" }, 202);
      }
      return jsonResponse({
        status: "authorized",
        session_id: "ses_123",
        token: "aurak_live_test",
      });
    }
    return jsonResponse({ error: "unknown" }, 404);
  };

  const client = new DeviceFlowClient({
    controlPlaneBaseUrl: "http://127.0.0.1:8788",
    client: "test-client",
    fetchImpl: fetchImpl as typeof fetch,
  });
  const code = await client.requestCode({
    requested_scopes: ["read"],
    requested_agent_id: "test-agent",
  });
  const handoff = await client.pollForToken(code.device_code, {
    interval: code.interval,
    expires_in: code.expires_in,
  });

  assert.equal(handoff.session_id, "ses_123");
  assert.equal(handoff.token, "aurak_live_test");
  assert.equal(calls.length, 3);
});

test("device client can target aura-web device flow routes", async () => {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "http://localhost:3000/api/conduit/device/code") {
      assert.equal(init?.method, "POST");
      return jsonResponse({
        device_code: "dev_web_123",
        user_code: "WXYZ-7890",
        verify_url:
          "http://localhost:3000/dashboard/conduit/device?code=WXYZ-7890",
        interval: 0,
        expires_in: 2,
      });
    }
    if (url === "http://localhost:3000/api/conduit/device/token") {
      return jsonResponse({
        status: "authorized",
        session_id: "ses_web_123",
        token: "aurak_live_web",
      });
    }
    return jsonResponse({ error: "unknown" }, 404);
  };

  const client = new DeviceFlowClient({
    controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    deviceFlowPath: "/device",
    client: "test-client",
    fetchImpl: fetchImpl as typeof fetch,
  });
  const code = await client.requestCode({
    requested_scopes: ["read", "wallet:read"],
    requested_agent_id: "test-agent",
  });
  const handoff = await client.pollForToken(code.device_code, {
    interval: code.interval,
    expires_in: code.expires_in,
  });

  assert.equal(code.user_code, "WXYZ-7890");
  assert.equal(handoff.session_id, "ses_web_123");
  assert.equal(handoff.token, "aurak_live_web");
  assert.deepEqual(calls, [
    "http://localhost:3000/api/conduit/device/code",
    "http://localhost:3000/api/conduit/device/token",
  ]);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
