import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import test, { after } from "node:test";

import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

const tempDir = mkdtempSync(join(tmpdir(), "aura-backend-auth-"));
process.env["AURA_DATABASE_PATH"] = join(tempDir, "aura.db");
process.env["AURA_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
process.env["AURA_JWT_SECRET"] = randomBytes(32).toString("hex");
process.env["AURA_COOKIE_SECURE"] = "false";

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function signSiwsMessage(keypair: Keypair, message: string) {
  const seed = Buffer.from(keypair.secretKey).subarray(0, 32);
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  return bs58.encode(sign(null, Buffer.from(message, "utf8"), privateKey));
}

const auth = await import("../src/auth.js");
const agents = await import("../src/agent-keypairs.js");
const database = await import("../src/db/client.js");

after(() => {
  database.closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

test("SIWS login issues an httpOnly cookie and rejects nonce replay", async () => {
  const wallet = Keypair.generate();
  const nonce = auth.createAuthNonce();
  const signature = signSiwsMessage(wallet, nonce.message);

  const login = await auth.loginWithWallet({
    walletAddress: wallet.publicKey.toBase58(),
    message: nonce.message,
    signature,
  });

  assert.equal(login.data.wallet, wallet.publicKey.toBase58());
  assert.match(login.cookie, /aura_session=/);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);

  const request = {
    headers: {
      cookie: login.cookie.split(";")[0],
    },
  };
  const user = await auth.getAuthenticatedUser(request as never);
  assert.equal(user?.wallet, wallet.publicKey.toBase58());

  await assert.rejects(
    () =>
      auth.loginWithWallet({
        walletAddress: wallet.publicKey.toBase58(),
        message: nonce.message,
        signature,
      }),
    /Nonce is expired, missing, or already used/,
  );
});

test("agent keypairs are encrypted at rest and expose only non-secret identity data", async () => {
  const wallet = Keypair.generate();
  const nonce = auth.createAuthNonce();
  const login = await auth.loginWithWallet({
    walletAddress: wallet.publicKey.toBase58(),
    message: nonce.message,
    signature: signSiwsMessage(wallet, nonce.message),
  });
  const user = (await auth.getAuthenticatedUser({
    headers: { cookie: login.cookie.split(";")[0] },
  } as never))!;

  const created = agents.createAgentKeypair(user, {
    agentId: "ops_agent",
    label: "Ops Agent",
  });
  assert.equal(created.agent.agentId, "ops_agent");
  assert.equal(created.identity.label, "Ops Agent");
  assert.equal("encryptedSecretKey" in created.identity, false);

  const listed = agents.listAgentKeypairs(user);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.publicKey, created.agent.publicKey);

  await agents.withAgentSigner(user, "ops_agent", async (signer) => {
    assert.equal(signer.publicKey.toBase58(), created.agent.publicKey);
  });

  const dwalletAddress = Keypair.generate().publicKey.toBase58();
  agents.storeDkgSession({
    agent: created.agent,
    dwalletAddress,
    sessionIdentifier: new Uint8Array(32).fill(7),
    dkgAttestation: {
      attestationData: new Uint8Array([1, 2, 3]),
      networkSignature: new Uint8Array([4, 5, 6]),
      networkPubkey: new Uint8Array([7, 8, 9]),
      epoch: 42n,
    },
  });

  const dkg = agents.getDkgSession({
    agent: created.agent,
    dwalletAddress,
  });
  assert.equal(dkg?.dkgAttestation.epoch, 42n);
  assert.deepEqual(Array.from(dkg?.sessionIdentifier ?? []), Array(32).fill(7));
});
