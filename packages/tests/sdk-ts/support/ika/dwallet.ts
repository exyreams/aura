/**
 * Persistent Ika dWallet + balance helpers for the wallet-control tests.
 *
 * `getOrCreateDwallet` provisions a dWallet via DKG once and caches the result
 * (public key + session identifier + attestation) to a gitignored JSON file, so
 * the same Solana custody address is reused across runs — you can fund that
 * address and re-run to see the balance. `readBalances` enumerates SOL plus
 * every SPL / Token-2022 balance held at an address.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  type Connection,
  type Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createIkaClient, type DKGAttestation } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Path to the cached dWallet (override with AURA_IKA_DWALLET_FILE). */
function storePath(): string {
  return process.env.AURA_IKA_DWALLET_FILE ?? join(here, ".dwallet.json");
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const unhex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));

/** A reusable dWallet: its Solana address plus the material needed to sign. */
export interface Dwallet {
  address: PublicKey;
  publicKey: Uint8Array;
  sessionIdentifier: Uint8Array;
  dkgAttestation: DKGAttestation;
}

interface StoredDwallet {
  address: string;
  publicKey: string;
  sessionIdentifier: string;
  attestationData: string;
  networkSignature: string;
  networkPubkey: string;
  epoch: string;
}

function load(): Dwallet | null {
  const path = storePath();
  if (!existsSync(path)) return null;
  const s = JSON.parse(readFileSync(path, "utf8")) as StoredDwallet;
  return {
    address: new PublicKey(s.address),
    publicKey: unhex(s.publicKey),
    sessionIdentifier: unhex(s.sessionIdentifier),
    dkgAttestation: {
      attestationData: unhex(s.attestationData),
      networkSignature: unhex(s.networkSignature),
      networkPubkey: unhex(s.networkPubkey),
      epoch: BigInt(s.epoch),
    },
  };
}

function save(dwallet: Dwallet): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const stored: StoredDwallet = {
    address: dwallet.address.toBase58(),
    publicKey: hex(dwallet.publicKey),
    sessionIdentifier: hex(dwallet.sessionIdentifier),
    attestationData: hex(dwallet.dkgAttestation.attestationData),
    networkSignature: hex(dwallet.dkgAttestation.networkSignature),
    networkPubkey: hex(dwallet.dkgAttestation.networkPubkey),
    epoch: dwallet.dkgAttestation.epoch.toString(),
  };
  writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`);
}

/**
 * Returns the cached dWallet, or provisions a fresh one via Ika DKG (signed by
 * `sender`) and caches it. The same address is reused on later runs.
 */
export async function getOrCreateDwallet(sender: Keypair): Promise<Dwallet> {
  const cached = load();
  if (cached) return cached;

  const ika = createIkaClient(undefined, sender.secretKey);
  try {
    const dkg = await ika.requestDKG(sender.publicKey.toBytes());
    const dwallet: Dwallet = {
      address: new PublicKey(dkg.publicKey),
      publicKey: dkg.publicKey,
      sessionIdentifier: dkg.sessionIdentifier,
      dkgAttestation: dkg.dkgAttestation,
    };
    save(dwallet);
    return dwallet;
  } finally {
    ika.close();
  }
}

/** A single SPL/Token-2022 balance at an address. */
export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number | null;
  tokenProgram: string;
}

export interface AddressBalances {
  sol: number;
  lamports: number;
  tokens: TokenBalance[];
}

/** Reads SOL plus every SPL and Token-2022 balance held at `owner`. */
export async function readBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<AddressBalances> {
  const lamports = await connection.getBalance(owner);
  const tokens: TokenBalance[] = [];
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const { value } = await connection.getParsedTokenAccountsByOwner(owner, {
      programId,
    });
    for (const { account } of value) {
      const info = account.data.parsed.info;
      tokens.push({
        mint: info.mint,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount,
        tokenProgram: programId.toBase58(),
      });
    }
  }
  return { sol: lamports / LAMPORTS_PER_SOL, lamports, tokens };
}
