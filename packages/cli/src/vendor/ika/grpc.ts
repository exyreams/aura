// Copyright (c) dWallet Labs, Ltd.
// SPDX-License-Identifier: BSD-3-Clause-Clear

// Node.js / Bun gRPC client for the Ika dWallet service.
// Uses @grpc/grpc-js for native gRPC transport.

import * as grpc from '@grpc/grpc-js';
import { ed25519 } from '@noble/curves/ed25519';
import {
  DWalletServiceClient,
  type UserSignedRequest as ProtoRequest,
} from './generated/grpc/ika_dwallet.js';
import { defineBcsTypes } from './bcs-types.js';

const { SignedRequestData, TransactionResponseData, UserSignature, VersionedDWalletDataAttestation, VersionedPresignDataAttestation } =
  defineBcsTypes();

export { defineBcsTypes } from './bcs-types.js';

/** Raw DKG attestation fields needed for subsequent presign/sign requests. */
export interface DKGAttestation {
  attestationData: Uint8Array;
  networkSignature: Uint8Array;
  networkPubkey: Uint8Array;
  epoch: bigint;
}

export interface DKGResult {
  dwalletAddr: Uint8Array;
  publicKey: Uint8Array;
  publicOutput: Uint8Array;
  /** 32-byte session identifier from the DKG attestation V1 payload.
   *  Must be used as `session_identifier_preimage` for presign and sign. */
  sessionIdentifier: Uint8Array;
  /** Full DKG attestation — must be passed as `dwallet_attestation` in Sign. */
  dkgAttestation: DKGAttestation;
}

export interface IkaDWalletClient {
  requestDKG(senderPubkey: Uint8Array): Promise<DKGResult>;
  /**
   * @param senderPubkey        32-byte Ed25519 public key of the sender.
   * @param sessionIdentifier   32-byte session identifier from DKG (live.session_identifier).
   */
  requestPresign(senderPubkey: Uint8Array, sessionIdentifier: Uint8Array): Promise<Uint8Array>;
  /**
   * @param senderPubkey        32-byte Ed25519 public key of the sender.
   * @param sessionIdentifier   32-byte session identifier from DKG.
   * @param message             Message bytes to sign.
   * @param presignId           presign_session_identifier from the presign response.
   * @param txSignature         Solana tx signature bytes (approval proof).
   * @param dkgAttestation      Full DKG attestation from requestDKG.
   */
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
 * @param grpcUrl    gRPC endpoint URL.
 * @param secretKey  64-byte Ed25519 secret key (Solana Keypair.secretKey).
 *                   The first 32 bytes are the seed; the last 32 are the pubkey.
 *                   Required to produce real signatures on BCS request data.
 */
export function createIkaClient(grpcUrl?: string, secretKey?: Uint8Array): IkaDWalletClient {
  const url = grpcUrl ?? '127.0.0.1:50051';
  const creds = url.includes('localhost') || url.match(/127\.0\.0\.1/)
    ? grpc.credentials.createInsecure()
    : grpc.credentials.createSsl();
  const client = new DWalletServiceClient(url, creds);

  function submit(userSig: Uint8Array, signedData: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      client.submitTransaction(
        { userSignature: Buffer.from(userSig), signedRequestData: Buffer.from(signedData) },
        (err, resp) => {
          if (err) reject(err);
          else resolve(new Uint8Array(resp!.responseData));
        },
      );
    });
  }

  /**
   * Sign `data` with the Ed25519 secret key and wrap it in the UserSignature
   * BCS envelope expected by the dWallet gRPC service.
   *
   * Mirrors the Rust smoke test `build_dwallet_request()`:
   *   let sig = payer.sign_message(&data);
   *   UserSignature::Ed25519 { signature: sig.as_ref().to_vec(), public_key: ... }
   */
  function buildSig(pubkey: Uint8Array, data: Uint8Array): Uint8Array {
    let signature: Uint8Array;
    if (secretKey && secretKey.length >= 32) {
      // @noble/curves ed25519.sign takes the 32-byte seed (first half of the
      // 64-byte Solana secret key).
      const seed = secretKey.slice(0, 32);
      signature = ed25519.sign(data, seed);
    } else {
      // Fallback: zero signature (pre-alpha networks that don't validate sigs).
      signature = new Uint8Array(64);
    }
    return UserSignature.serialize({
      Ed25519: { signature: Array.from(signature), public_key: Array.from(pubkey) },
    }).toBytes();
  }

  return {
    async requestDKG(senderPubkey) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(new Uint8Array(32)),
        epoch: 1n, chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: { DKG: {
          dwallet_network_encryption_public_key: Array.from(new Uint8Array(32)),
          curve: { Curve25519: true },
          centralized_public_key_share_and_proof: Array.from(new Uint8Array(32)),
          user_secret_key_share: { Encrypted: {
            encrypted_centralized_secret_share_and_proof: Array.from(new Uint8Array(32)),
            encryption_key: Array.from(new Uint8Array(32)),
            signer_public_key: Array.from(senderPubkey),
          }},
          user_public_output: Array.from(new Uint8Array(32)),
          sign_during_dkg_request: null,
        }},
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (!resp.Attestation) throw new Error(`DKG failed: ${JSON.stringify(resp)}`);
      const att = resp.Attestation;
      // Decode the versioned DWallet data attestation from the signed bytes.
      const payload = VersionedDWalletDataAttestation.parse(new Uint8Array(att.attestation_data));
      if (!payload.V1) {
        throw new Error(`unexpected DKG payload variant: ${JSON.stringify(payload)}`);
      }
      const created = payload.V1;

      // Extract the 32-byte session_identifier from the DKG attestation.
      // This is used as session_identifier_preimage for all subsequent requests
      // (presign + sign), matching the Rust smoke test's live.session_identifier.
      const sessionIdentifier = new Uint8Array(created.session_identifier);

      const dkgAttestation: DKGAttestation = {
        attestationData: new Uint8Array(att.attestation_data),
        networkSignature: new Uint8Array(att.network_signature),
        networkPubkey: new Uint8Array(att.network_pubkey),
        epoch: BigInt(att.epoch),
      };

      // dwalletAddr is now derived from (curve, public_key) on-chain via
      // the dwallet PDA seeds; we don't extract it from attestation bytes.
      return {
        dwalletAddr: new Uint8Array(32),
        publicKey: new Uint8Array(created.public_key),
        publicOutput: new Uint8Array(created.public_output),
        sessionIdentifier,
        dkgAttestation,
      };
    },

    async requestPresign(senderPubkey, sessionIdentifier) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(sessionIdentifier),
        epoch: 1n, chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: { Presign: {
          dwallet_network_encryption_public_key: Array.from(new Uint8Array(32)),
          curve: { Curve25519: true },
          signature_algorithm: { EdDSA: true },
        }},
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (!resp.Attestation) throw new Error(`Presign failed: ${JSON.stringify(resp)}`);
      const payload = VersionedPresignDataAttestation.parse(new Uint8Array(resp.Attestation.attestation_data));
      if (!payload.V1) {
        throw new Error(`unexpected presign payload variant: ${JSON.stringify(payload)}`);
      }
      return new Uint8Array(payload.V1.presign_session_identifier);
    },

    async requestSign(senderPubkey, sessionIdentifier, message, presignId, txSignature, dkgAttestation) {
      const data = SignedRequestData.serialize({
        session_identifier_preimage: Array.from(sessionIdentifier),
        epoch: 1n, chain_id: { Solana: true },
        intended_chain_sender: Array.from(senderPubkey),
        request: { Sign: {
          message: Array.from(message), message_metadata: [],
          presign_session_identifier: Array.from(presignId),
          message_centralized_signature: Array.from(new Uint8Array(64)),
          dwallet_attestation: {
            attestation_data: Array.from(dkgAttestation.attestationData),
            network_signature: Array.from(dkgAttestation.networkSignature),
            network_pubkey: Array.from(dkgAttestation.networkPubkey),
            epoch: dkgAttestation.epoch,
          },
          approval_proof: { Solana: { transaction_signature: Array.from(txSignature), slot: 0n } },
        }},
      }).toBytes();

      const respBytes = await submit(buildSig(senderPubkey, data), data);
      const resp = TransactionResponseData.parse(new Uint8Array(respBytes));
      if (resp.Signature) return new Uint8Array(resp.Signature.signature);
      if (resp.Error) throw new Error(resp.Error.message);
      throw new Error(`Unexpected: ${JSON.stringify(resp)}`);
    },

    close() { client.close(); },
  };
}
