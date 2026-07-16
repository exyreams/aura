import { strict as assert } from "node:assert";
import { test } from "node:test";
import cookie from "@fastify/cookie";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import Fastify from "fastify";
import nacl from "tweetnacl";

import {
  extractOwnerCookie,
  makeRequireOwner,
  registerOwnerAuthRoutes,
} from "../src/http/owner-auth.js";

async function setupFastify() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cookie, {
    secret: "test-secret-for-owner-auth-tests",
  });
  await registerOwnerAuthRoutes(fastify, { secureCookie: false });
  return fastify;
}

test("nonce endpoint returns a message containing the wallet + nonce", async () => {
  const fastify = await setupFastify();
  const owner = Keypair.generate().publicKey.toBase58();
  const res = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=${owner}`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    nonce: string;
    message: string;
    expiresAt: number;
  };
  assert.match(body.message, new RegExp(`Nonce: ${body.nonce}`));
  assert.match(body.message, new RegExp(owner));
  await fastify.close();
});

test("nonce rejects an invalid wallet pubkey", async () => {
  const fastify = await setupFastify();
  const res = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=not-a-pubkey`,
  });
  assert.equal(res.statusCode, 400);
  await fastify.close();
});

test("login round-trip with a valid signature sets the owner cookie", async () => {
  const fastify = await setupFastify();
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();

  const nonceRes = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=${wallet}`,
  });
  const { message } = nonceRes.json() as { message: string };

  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    kp.secretKey,
  );
  const loginRes = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      wallet,
      message,
      signature: bs58.encode(signature),
    }),
  });
  assert.equal(loginRes.statusCode, 200);
  const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
  const session = cookies.find((c) => c.name === "aura_conduit_owner");
  assert.notEqual(session, undefined);
  assert(session !== undefined);

  const meRes = await fastify.inject({
    method: "GET",
    url: "/control-plane/auth/me",
    cookies: { aura_conduit_owner: session.value },
  });
  assert.equal(meRes.statusCode, 200);
  assert.deepEqual(meRes.json(), { wallet });
  await fastify.close();
});

test("login rejects a signature from the wrong keypair", async () => {
  const fastify = await setupFastify();
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const nonceRes = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=${wallet}`,
  });
  const { message } = nonceRes.json() as { message: string };

  const wrongKp = Keypair.generate();
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    wrongKp.secretKey,
  );

  const loginRes = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      wallet,
      message,
      signature: bs58.encode(signature),
    }),
  });
  assert.equal(loginRes.statusCode, 401);
  await fastify.close();
});

test("login rejects a forged nonce that was never issued", async () => {
  const fastify = await setupFastify();
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const forged = `AURA Conduit wants you to sign in with your Solana account:\n${wallet}\n\nNonce: deadbeef`;
  const signature = nacl.sign.detached(
    new TextEncoder().encode(forged),
    kp.secretKey,
  );
  const loginRes = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      wallet,
      message: forged,
      signature: bs58.encode(signature),
    }),
  });
  assert.equal(loginRes.statusCode, 400);
  await fastify.close();
});

test("logout clears the cookie", async () => {
  const fastify = await setupFastify();
  const res = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/logout",
  });
  assert.equal(res.statusCode, 200);
  await fastify.close();
});

test("requireOwner rejects without a cookie", async () => {
  const fastify = await setupFastify();
  fastify.get("/protected", { preHandler: makeRequireOwner() }, async () => ({
    ok: true,
  }));
  const res = await fastify.inject({ method: "GET", url: "/protected" });
  assert.equal(res.statusCode, 401);
  await fastify.close();
});

test("requireOwner accepts a valid cookie and exposes authedOwner on the request", async () => {
  const fastify = await setupFastify();
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  fastify.get(
    "/whoami-protected",
    { preHandler: makeRequireOwner() },
    async (req) => ({ authed: extractOwnerCookie(req) }),
  );

  const nonceRes = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=${wallet}`,
  });
  const { message } = nonceRes.json() as { message: string };
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    kp.secretKey,
  );
  const loginRes = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      wallet,
      message,
      signature: bs58.encode(signature),
    }),
  });
  const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
  const session = cookies.find((c) => c.name === "aura_conduit_owner");
  assert(session !== undefined);

  const res = await fastify.inject({
    method: "GET",
    url: "/whoami-protected",
    cookies: { aura_conduit_owner: session.value },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authed: wallet });
  await fastify.close();
});

test("requireOwner with targetOwner rejects mismatched targets", async () => {
  const fastify = await setupFastify();
  const kp = Keypair.generate();
  const wallet = kp.publicKey.toBase58();
  const other = new PublicKey(Keypair.generate().publicKey).toBase58();
  fastify.get<{ Params: { owner: string } }>(
    "/owner/:owner",
    {
      preHandler: makeRequireOwner({
        targetOwner: (req) => (req.params as { owner: string }).owner,
      }),
    },
    async () => ({ ok: true }),
  );

  const nonceRes = await fastify.inject({
    method: "GET",
    url: `/control-plane/auth/nonce?wallet=${wallet}`,
  });
  const { message } = nonceRes.json() as { message: string };
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    kp.secretKey,
  );
  const loginRes = await fastify.inject({
    method: "POST",
    url: "/control-plane/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      wallet,
      message,
      signature: bs58.encode(signature),
    }),
  });
  const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
  const session = cookies.find((c) => c.name === "aura_conduit_owner");
  assert(session !== undefined);

  const mismatch = await fastify.inject({
    method: "GET",
    url: `/owner/${other}`,
    cookies: { aura_conduit_owner: session.value },
  });
  assert.equal(mismatch.statusCode, 403);

  const match = await fastify.inject({
    method: "GET",
    url: `/owner/${wallet}`,
    cookies: { aura_conduit_owner: session.value },
  });
  assert.equal(match.statusCode, 200);
  await fastify.close();
});
