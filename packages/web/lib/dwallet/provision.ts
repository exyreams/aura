import { Keypair, PublicKey } from "@solana/web3.js";
import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { createIkaClient, IKA_DWALLET_GRPC_URL } from "@/lib/ika/client";
import type { Json } from "@/lib/supabase/types";

const CURVE25519_CODE = 2;
const DWALLET_DEVNET_PROGRAM_ID = new PublicKey(
  "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
);

interface ProvisionIkaDWalletInput {
  chainId: number;
  label: string | null;
}

export interface ProvisionedIkaDWallet {
  provider: "ika";
  providerSessionId: string;
  chainId: number;
  chainAddress: string;
  label: string | null;
  dwalletId: string;
  dwalletAccount: string;
  authorizedUserPubkey: string;
  messageMetadataDigest: string | null;
  publicKeyHex: string;
  registrationTxSignature: string | null;
  sessionMaterial: Json;
}

function toHex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function toBase64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function toU16LE(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

export function deriveDwalletPda(
  publicKey: Uint8Array,
  programId: PublicKey = DWALLET_DEVNET_PROGRAM_ID,
) {
  const payload = Buffer.concat([
    toU16LE(CURVE25519_CODE),
    Buffer.from(publicKey),
  ]);
  const chunks: Buffer[] = [];

  for (let index = 0; index < payload.length; index += 32) {
    chunks.push(payload.subarray(index, Math.min(index + 32, payload.length)));
  }

  return PublicKey.findProgramAddressSync(
    [Buffer.from("dwallet"), ...chunks],
    programId,
  )[0];
}

function getIkaGrpcUrl() {
  return process.env.IKA_DWALLET_GRPC_URL?.trim() || IKA_DWALLET_GRPC_URL;
}

export async function provisionIkaDWallet({
  chainId,
  label,
}: ProvisionIkaDWalletInput): Promise<ProvisionedIkaDWallet> {
  if (chainId !== SOLANA_CHAIN_ID) {
    throw new Error("Online Ika provisioning currently supports Solana only.");
  }

  const authority = Keypair.generate();
  const grpcUrl = getIkaGrpcUrl();
  const ika = createIkaClient(grpcUrl, authority.secretKey);

  try {
    const dkg = await ika.requestDKG(authority.publicKey.toBytes());
    const dwalletAccount = deriveDwalletPda(dkg.publicKey);
    const publicKeyHex = toHex(dkg.publicKey);
    const chainAddress = new PublicKey(dkg.publicKey).toBase58();
    const providerSessionId = toHex(dkg.sessionIdentifier);

    return {
      provider: "ika",
      providerSessionId,
      chainId,
      chainAddress,
      label,
      dwalletId: dwalletAccount.toBase58(),
      dwalletAccount: dwalletAccount.toBase58(),
      authorizedUserPubkey: authority.publicKey.toBase58(),
      messageMetadataDigest: null,
      publicKeyHex,
      registrationTxSignature: null,
      sessionMaterial: {
        version: "aura.ika_dwallet_session.v1",
        provider: "ika",
        grpc_url: grpcUrl,
        chain_id: chainId,
        curve: "Curve25519",
        signature_scheme: "EdDSA",
        authority: {
          public_key: authority.publicKey.toBase58(),
          secret_key_base64url: toBase64Url(authority.secretKey),
        },
        dwallet: {
          id: dwalletAccount.toBase58(),
          account: dwalletAccount.toBase58(),
          address: chainAddress,
          public_key_hex: publicKeyHex,
          public_output_hex: toHex(dkg.publicOutput),
        },
        dkg: {
          session_identifier_hex: providerSessionId,
          attestation_data_hex: toHex(dkg.dkgAttestation.attestationData),
          network_signature_hex: toHex(dkg.dkgAttestation.networkSignature),
          network_pubkey_hex: toHex(dkg.dkgAttestation.networkPubkey),
          epoch: dkg.dkgAttestation.epoch.toString(),
        },
      },
    };
  } finally {
    ika.close();
  }
}
