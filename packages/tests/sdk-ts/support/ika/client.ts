/**
 * Thin Node gRPC client for the Ika dWallet service, adapted from
 * `packages/cli/src/lib/ika.ts` + its vendored wrapper. Exposes the three
 * primitives the wallet-control tests need:
 *   - requestDKG   — provision an Ed25519 dWallet (returns its public key)
 *   - requestPresign / requestSign — MPC-sign an arbitrary message
 *
 * The generated gRPC stubs + BCS types live under `./vendor/` (synced from the
 * installed @ika.xyz package by `sync.mjs`, gitignored).
 */

import * as grpc from "@grpc/grpc-js";
import { ed25519 } from "@noble/curves/ed25519";
import { defineBcsTypes } from "./vendor/bcs-types.js";
import { DWalletServiceClient } from "./vendor/generated/grpc/ika_dwallet.js";

/** Ika dWallet pre-alpha gRPC endpoint on Solana devnet. */
export const IKA_DWALLET_GRPC_URL = "pre-alpha-dev-1.ika.ika-network.net:443";

const {
  SignedRequestData,
  TransactionResponseData,
  UserSignature,
  VersionedDWalletDataAttestation,
  VersionedPresignDataAttestation,
} = defineBcsTypes();

/** Raw DKG attestation fields needed for subsequent presign/sign requests. */
export interface DKGAttestation {
  attestationData: Uint8Array;
  networkSignature: Uint8Array;
  networkPubkey: Uint8Array;
  epoch: bigint;
}

export interface DKGResult {
  /** The dWallet's Ed25519 public key — a valid Solana custody address. */
  publicKey: Uint8Array;
  publicOutput: Uint8Array;
  /** 32-byte session identifier; reused for presign + sign. */
  sessionIdentifier: Uint8Array;
  dkgAttestation: DKGAttestation;
}

export interface IkaDWalletClient {
  requestDKG(senderPubkey: Uint8Array): Promise<DKGResult>;
  requestPresign(
    senderPubkey: Uint8Array,
    sessionIdentifier: Uint8Array,
  ): Promise<Uint8Array>;
  requestSign(
    senderPubkey: Uint8Array,
    sessionIdentifier: Uint8Array,
    message: Uint8Array,
    presignId: Uint8Array,
    txSignature: Uint8Array,
    dkgAttestation: DKGAttestation,
  ): Promise<Uint8Array>;
  close(): void;
}

/**
 * Creates an Ika dWallet gRPC client.
 *
 * @param grpcUrl    gRPC endpoint (defaults to the pre-alpha devnet endpoint).
 * @param secretKey  64-byte Ed25519 secret key (Solana Keypair.secretKey) used
 *                   to sign the BCS request envelope.
 */
export function createIkaClient(
  grpcUrl: string = IKA_DWALLET_GRPC_URL,
  secretKey?: Uint8Array,
): IkaDWalletClient {
  const creds =
    grpcUrl.includes("localhost") || grpcUrl.match(/127\.0\.0\.1/)
      ? grpc.credentials.createInsecure()
      : grpc.credentials.createSsl();
  const client = new DWalletServiceClient(grpcUrl, creds);

  function submit(
    userSig: Uint8Array,
    signedData: Uint8Array,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      client.submitTransaction(
        {
          userSignature: Buffer.from(userSig),
          signedRequestData: Buffer.from(signedData),
        },
        (err, resp) => {
          if (err) reject(err);
          else resolve(new Uint8Array(resp.responseData));
        },
      );
    });
  }

  function buildSig(pubkey: Uint8Array, data: Uint8Array): Uint8Array {
    let signature: Uint8Array;
    if (secretKey && secretKey.length >= 32) {
      signature = ed25519.sign(data, secretKey.slice(0, 32));
    } else {
      signature = new Uint8Array(64);
    }
    return UserSignature.serialize({
      Ed25519: {
        signature: Array.from(signature),
        public_key: Array.from(pubkey),
      },
    }).toBytes();
  }

  return {
    async requestDKG(senderPubkey) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(new Uint8Array(32)),
        epoch: 1n,
        chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: {
          DKG: {
            dwallet_network_encryption_public_key: Array.from(
              new Uint8Array(32),
            ),
            curve: { Curve25519: true },
            centralized_public_key_share_and_proof: Array.from(
              new Uint8Array(32),
            ),
            user_secret_key_share: {
              Encrypted: {
                encrypted_centralized_secret_share_and_proof: Array.from(
                  new Uint8Array(32),
                ),
                encryption_key: Array.from(new Uint8Array(32)),
                signer_public_key: Array.from(senderPubkey),
              },
            },
            user_public_output: Array.from(new Uint8Array(32)),
            sign_during_dkg_request: null,
          },
        },
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (!resp.Attestation) {
        throw new Error(`DKG failed: ${JSON.stringify(resp)}`);
      }
      const att = resp.Attestation;
      const payload = VersionedDWalletDataAttestation.parse(
        new Uint8Array(att.attestation_data),
      );
      if (!payload.V1) {
        throw new Error(`unexpected DKG payload: ${JSON.stringify(payload)}`);
      }
      const created = payload.V1;
      return {
        publicKey: new Uint8Array(created.public_key),
        publicOutput: new Uint8Array(created.public_output),
        sessionIdentifier: new Uint8Array(created.session_identifier),
        dkgAttestation: {
          attestationData: new Uint8Array(att.attestation_data),
          networkSignature: new Uint8Array(att.network_signature),
          networkPubkey: new Uint8Array(att.network_pubkey),
          epoch: BigInt(att.epoch),
        },
      };
    },

    async requestPresign(senderPubkey, sessionIdentifier) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(sessionIdentifier),
        epoch: 1n,
        chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: {
          Presign: {
            dwallet_network_encryption_public_key: Array.from(
              new Uint8Array(32),
            ),
            curve: { Curve25519: true },
            signature_algorithm: { EdDSA: true },
          },
        },
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (!resp.Attestation) {
        throw new Error(`Presign failed: ${JSON.stringify(resp)}`);
      }
      const payload = VersionedPresignDataAttestation.parse(
        new Uint8Array(resp.Attestation.attestation_data),
      );
      if (!payload.V1) {
        throw new Error(
          `unexpected presign payload: ${JSON.stringify(payload)}`,
        );
      }
      return new Uint8Array(payload.V1.presign_session_identifier);
    },

    async requestSign(
      senderPubkey,
      sessionIdentifier,
      message,
      presignId,
      txSignature,
      dkgAttestation,
    ) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(sessionIdentifier),
        epoch: 1n,
        chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: {
          Sign: {
            message: Array.from(message),
            message_metadata: [],
            presign_session_identifier: Array.from(presignId),
            message_centralized_signature: Array.from(new Uint8Array(64)),
            dwallet_attestation: {
              attestation_data: Array.from(dkgAttestation.attestationData),
              network_signature: Array.from(dkgAttestation.networkSignature),
              network_pubkey: Array.from(dkgAttestation.networkPubkey),
              epoch: dkgAttestation.epoch,
            },
            approval_proof: {
              Solana: {
                transaction_signature: Array.from(txSignature),
                slot: 0n,
              },
            },
          },
        },
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (resp.Signature) return new Uint8Array(resp.Signature.signature);
      if (resp.Error) throw new Error(resp.Error.message);
      throw new Error(`Unexpected sign response: ${JSON.stringify(resp)}`);
    },

    close() {
      client.close();
    },
  };
}
