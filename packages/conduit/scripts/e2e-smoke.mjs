#!/usr/bin/env node
// End-to-end smoke for Conduit owner SIWS auth + device-flow approval.
// Spins up the real /control-plane endpoints on the live server (no mocks)
// and walks through: nonce → wallet-signed login → cookie set → privileged
// list call → device-code mint (CLI side) → dashboard approve → CLI poll
// returns the token. Run with: node scripts/e2e-smoke.mjs <BASE_URL>

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const BASE = process.argv[2] ?? "http://127.0.0.1:8788";

function logStep(n, label) {
  process.stdout.write(`\n[${n}] ${label}\n`);
}

function extractCookie(setCookieHeader) {
  // Returns just the name=value pair (drops Path/Domain/etc).
  if (typeof setCookieHeader !== "string") return null;
  const first = setCookieHeader.split(";")[0]?.trim();
  return first ?? null;
}

async function main() {
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  process.stdout.write(`Generated test wallet: ${wallet}\n`);

  logStep(1, "GET /control-plane/auth/nonce");
  const nonceRes = await fetch(
    `${BASE}/control-plane/auth/nonce?wallet=${wallet}`,
  );
  const nonce = await nonceRes.json();
  if (!nonceRes.ok) throw new Error(`nonce failed: ${JSON.stringify(nonce)}`);
  process.stdout.write(`  message starts: ${nonce.message.slice(0, 60)}...\n`);

  logStep(2, "signMessage + POST /control-plane/auth/login");
  const sig = nacl.sign.detached(
    new TextEncoder().encode(nonce.message),
    kp.secretKey,
  );
  const loginRes = await fetch(`${BASE}/control-plane/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet,
      message: nonce.message,
      signature: bs58.encode(sig),
    }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok)
    throw new Error(
      `login failed (${loginRes.status}): ${JSON.stringify(loginBody)}`,
    );
  const cookie = extractCookie(loginRes.headers.get("set-cookie"));
  if (cookie === null) throw new Error("login returned no set-cookie");
  process.stdout.write(`  cookie set: ${cookie.slice(0, 40)}...\n`);

  logStep(3, "GET /control-plane/auth/me (with cookie)");
  const meRes = await fetch(`${BASE}/control-plane/auth/me`, {
    headers: { cookie },
  });
  const me = await meRes.json();
  if (me.wallet !== wallet)
    throw new Error(`auth/me did not return wallet: ${JSON.stringify(me)}`);
  process.stdout.write(`  authed as: ${me.wallet}\n`);

  logStep(
    4,
    "GET /control-plane/sessions/owner/<wallet> (privileged, cookie required)",
  );
  const sessRes = await fetch(
    `${BASE}/control-plane/sessions/owner/${wallet}`,
    {
      headers: { cookie },
    },
  );
  const sessions = await sessRes.json();
  if (!sessRes.ok)
    throw new Error(`sessions list failed: ${JSON.stringify(sessions)}`);
  process.stdout.write(
    `  sessions: ${sessions.sessions.length} (expected 0 for a fresh wallet)\n`,
  );

  logStep(5, "GET sessions WITHOUT cookie → must 401");
  const denyRes = await fetch(`${BASE}/control-plane/sessions/owner/${wallet}`);
  if (denyRes.status !== 401)
    throw new Error(
      `unauthenticated sessions list returned ${denyRes.status}, expected 401`,
    );
  process.stdout.write(`  ✓ returned 401\n`);

  logStep(6, "GET sessions for a DIFFERENT owner with our cookie → must 403");
  const otherOwner = Keypair.generate().publicKey.toBase58();
  const xRes = await fetch(
    `${BASE}/control-plane/sessions/owner/${otherOwner}`,
    {
      headers: { cookie },
    },
  );
  if (xRes.status !== 403)
    throw new Error(
      `cross-owner sessions list returned ${xRes.status}, expected 403`,
    );
  process.stdout.write(`  ✓ returned 403\n`);

  logStep(7, "POST /control-plane/device/code (CLI starts device flow)");
  const codeRes = await fetch(`${BASE}/control-plane/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client: "e2e-smoke/0.0",
      requested_scopes: ["read", "propose"],
      requested_agent_id: "smoke-agent",
    }),
  });
  const code = await codeRes.json();
  if (!codeRes.ok)
    throw new Error(`device/code failed: ${JSON.stringify(code)}`);
  process.stdout.write(
    `  device_code=${code.device_code.slice(0, 16)}... user_code=${code.user_code}\n`,
  );

  logStep(8, "GET /control-plane/device/by-code/:userCode (dashboard decodes)");
  const lookupRes = await fetch(
    `${BASE}/control-plane/device/by-code/${code.user_code}`,
    {
      headers: { cookie },
    },
  );
  const lookup = await lookupRes.json();
  if (!lookupRes.ok)
    throw new Error(`by-code lookup failed: ${JSON.stringify(lookup)}`);
  process.stdout.write(
    `  decoded: client=${lookup.client}, agent=${lookup.requested_agent_id}\n`,
  );

  const treasury = Keypair.generate().publicKey.toBase58();
  logStep(9, "POST /control-plane/device/:userCode/approve");
  const approveRes = await fetch(
    `${BASE}/control-plane/device/${code.user_code}/approve`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ treasury_pubkey: treasury }),
    },
  );
  const approveBody = await approveRes.json();
  if (!approveRes.ok)
    throw new Error(`approve failed: ${JSON.stringify(approveBody)}`);
  if (approveBody.owner_pubkey !== wallet) {
    throw new Error(`approve pinned wrong owner: ${approveBody.owner_pubkey}`);
  }
  process.stdout.write(`  session=${approveBody.session_id}\n`);
  process.stdout.write(
    `  owner pinned from cookie (NOT body): ${approveBody.owner_pubkey}\n`,
  );

  logStep(10, "POST /control-plane/device/token (CLI polls, gets token)");
  const tokenRes = await fetch(`${BASE}/control-plane/device/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_code: code.device_code }),
  });
  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok)
    throw new Error(`token poll failed: ${JSON.stringify(tokenBody)}`);
  if (!tokenBody.token?.startsWith("aurak_live_")) {
    throw new Error(
      `expected aurak_live_ token, got: ${JSON.stringify(tokenBody)}`,
    );
  }
  process.stdout.write(`  ✓ token: ${tokenBody.token.slice(0, 20)}...\n`);

  logStep(
    11,
    "POST /control-plane/device/token AGAIN → must 410 (one-time handoff)",
  );
  const replayRes = await fetch(`${BASE}/control-plane/device/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_code: code.device_code }),
  });
  if (replayRes.status !== 410)
    throw new Error(`token replay returned ${replayRes.status}, expected 410`);
  process.stdout.write(`  ✓ returned 410\n`);

  logStep(12, "GET /control-plane/sessions/owner/<wallet> → now has 1 session");
  const sess2Res = await fetch(
    `${BASE}/control-plane/sessions/owner/${wallet}`,
    {
      headers: { cookie },
    },
  );
  const sess2 = await sess2Res.json();
  if (sess2.sessions.length !== 1)
    throw new Error(`expected 1 session, got ${sess2.sessions.length}`);
  const created = sess2.sessions[0];
  if (created.agent_id !== "smoke-agent") throw new Error("agent_id mismatch");
  if (created.treasury_pubkey !== treasury)
    throw new Error("treasury mismatch");
  process.stdout.write(
    `  ✓ session ${created.id} bound to agent='${created.agent_id}' treasury=${created.treasury_pubkey.slice(0, 8)}...\n`,
  );

  logStep(13, "POST /v1/whoami with the minted token → bearer auth works");
  const whoami = await fetch(`${BASE}/v1/whoami`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenBody.token}`,
    },
    body: JSON.stringify({}),
  });
  const whoamiBody = await whoami.json();
  if (!whoami.ok)
    throw new Error(`whoami failed: ${JSON.stringify(whoamiBody)}`);
  process.stdout.write(
    `  ✓ whoami returned wallet=${whoamiBody.value.ownerPubkey.slice(0, 8)}...\n`,
  );

  logStep(14, "POST /control-plane/sessions/:id/revoke (cookie required)");
  const revokeRes = await fetch(
    `${BASE}/control-plane/sessions/${created.id}/revoke`,
    {
      method: "POST",
      headers: { cookie },
    },
  );
  if (!revokeRes.ok) throw new Error(`revoke failed: ${revokeRes.status}`);
  process.stdout.write(`  ✓ session revoked\n`);

  logStep(15, "POST /v1/whoami with the revoked token → must 401");
  const denyAfterRevoke = await fetch(`${BASE}/v1/whoami`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenBody.token}`,
    },
    body: JSON.stringify({}),
  });
  if (denyAfterRevoke.status !== 401) {
    throw new Error(
      `revoked-token call returned ${denyAfterRevoke.status}, expected 401`,
    );
  }
  process.stdout.write(`  ✓ returned 401\n`);

  logStep(16, "POST /control-plane/auth/logout → cookie cleared");
  const logoutRes = await fetch(`${BASE}/control-plane/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });
  if (!logoutRes.ok) throw new Error(`logout failed: ${logoutRes.status}`);
  process.stdout.write(`  ✓ logged out\n`);

  process.stdout.write(
    `\n✅ ALL 16 STEPS PASSED — SIWS + device-flow + bearer + revoke loop verified end-to-end\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `\n❌ ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
