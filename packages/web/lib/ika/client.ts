import { randomBytes } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { defineBcsTypes } from "@/lib/ika/vendor/bcs-types";
import { DWalletServiceClient } from "@/lib/ika/vendor/generated/grpc/ika_dwallet";

export const IKA_DWALLET_GRPC_URL = "pre-alpha-dev-1.ika.ika-network.net:443";

const {
  SignedRequestData,
  TransactionResponseData,
  UserSignature,
  VersionedDWalletDataAttestation,
  VersionedPresignDataAttestation,
} = defineBcsTypes();

export interface DKGAttestation {
  attestationData: Uint8Array;
  networkSignature: Uint8Array;
  networkPubkey: Uint8Array;
  epoch: bigint;
}

export interface DKGResult {
  publicKey: Uint8Array;
  publicOutput: Uint8Array;
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

function isLocalGrpcUrl(value: string) {
  return value.includes("localhost") || /(^|:)127\.0\.0\.1(:|$)/.test(value);
}

function normalizeGrpcUrl(value?: string) {
  const configured = value?.trim() || IKA_DWALLET_GRPC_URL;
  return configured
    .replace(/^https?:\/\//, "")
    .replace(/^grpcs?:\/\//, "")
    .replace(/\/+$/, "");
}

function stringifyForError(value: unknown) {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
}

export function createIkaClient(
  grpcUrl?: string,
  secretKey?: Uint8Array,
): IkaDWalletClient {
  const url = normalizeGrpcUrl(grpcUrl);
  const credentials = isLocalGrpcUrl(url)
    ? grpc.credentials.createInsecure()
    : grpc.credentials.createSsl();
  const client = new DWalletServiceClient(url, credentials);

  function submit(
    userSignature: Uint8Array,
    signedRequestData: Uint8Array,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      client.submitTransaction(
        {
          userSignature: Buffer.from(userSignature),
          signedRequestData: Buffer.from(signedRequestData),
        },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }

          if (!response) {
            reject(new Error("Ika gRPC returned an empty response."));
            return;
          }

          resolve(new Uint8Array(response.responseData));
        },
      );
    });
  }

  function buildSignature(pubkey: Uint8Array, data: Uint8Array) {
    const signature =
      secretKey && secretKey.length >= 32
        ? ed25519.sign(data, secretKey.slice(0, 32))
        : new Uint8Array(64);

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
        session_identifier_preimage: Array.from(randomBytes(32)),
        epoch: BigInt(1),
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

      const responseBytes = await submit(
        buildSignature(senderPubkey, data),
        data,
      );
      const response = TransactionResponseData.parse(
        new Uint8Array(responseBytes),
      );

      if (!response.Attestation) {
        throw new Error(`DKG failed: ${stringifyForError(response)}`);
      }

      const attestation = response.Attestation;
      const payload = VersionedDWalletDataAttestation.parse(
        new Uint8Array(attestation.attestation_data),
      );

      if (!payload.V1) {
        throw new Error(
          `Unexpected DKG payload: ${stringifyForError(payload)}`,
        );
      }

      const created = payload.V1;

      return {
        publicKey: new Uint8Array(created.public_key),
        publicOutput: new Uint8Array(created.public_output),
        sessionIdentifier: new Uint8Array(created.session_identifier),
        dkgAttestation: {
          attestationData: new Uint8Array(attestation.attestation_data),
          networkSignature: new Uint8Array(attestation.network_signature),
          networkPubkey: new Uint8Array(attestation.network_pubkey),
          epoch: BigInt(attestation.epoch),
        },
      };
    },

    async requestPresign(senderPubkey, sessionIdentifier) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(sessionIdentifier),
        epoch: BigInt(1),
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

      const responseBytes = await submit(
        buildSignature(senderPubkey, data),
        data,
      );
      const response = TransactionResponseData.parse(
        new Uint8Array(responseBytes),
      );

      if (!response.Attestation) {
        throw new Error(`Presign failed: ${stringifyForError(response)}`);
      }

      const payload = VersionedPresignDataAttestation.parse(
        new Uint8Array(response.Attestation.attestation_data),
      );

      if (!payload.V1) {
        throw new Error(
          `Unexpected presign payload: ${stringifyForError(payload)}`,
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
        epoch: BigInt(1),
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
                slot: BigInt(0),
              },
            },
          },
        },
      }).toBytes();

      const responseBytes = await submit(
        buildSignature(senderPubkey, data),
        data,
      );
      const response = TransactionResponseData.parse(
        new Uint8Array(responseBytes),
      );

      if (response.Signature) {
        return new Uint8Array(response.Signature.signature);
      }

      if (response.Error) {
        throw new Error(response.Error.message);
      }

      throw new Error(
        `Unexpected sign response: ${stringifyForError(response)}`,
      );
    },

    close() {
      client.close();
    },
  };
}
