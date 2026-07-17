import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

export interface DWalletDetailRow {
  label: string;
  value: string;
  explorer?: string | null;
}

export function walletAddressExplorerUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function walletTransactionExplorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

export function metadataNestedString(
  metadata: Json,
  parent: string,
  key: string,
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" ? nested : null;
}

function metadataNestedNumber(metadata: Json, parent: string, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];

  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  if (typeof nested === "string" && /^\d+$/.test(nested)) {
    return Number(nested);
  }

  return null;
}

function addressExplorerForWallet(wallet: WalletRegistryRow, address: string) {
  return wallet.chain_id === SOLANA_CHAIN_ID
    ? walletAddressExplorerUrl(address)
    : null;
}

function compactRows(rows: Array<DWalletDetailRow | null>) {
  return rows.filter((row): row is DWalletDetailRow => Boolean(row?.value));
}

export function getDWalletRuntimeAccount(wallet: WalletRegistryRow) {
  return metadataNestedString(wallet.metadata, "dwallet", "dwallet_account");
}

export function getDWalletRegistrationSignature(wallet: WalletRegistryRow) {
  return (
    metadataString(wallet.metadata, "registration_tx_signature") ??
    metadataNestedString(wallet.metadata, "binding", "tx_signature")
  );
}

export function getDWalletTreasurySignature(wallet: WalletRegistryRow) {
  return metadataNestedString(
    wallet.metadata,
    "treasury_binding",
    "tx_signature",
  );
}

export function getDWalletHasEncryptedSession(wallet: WalletRegistryRow) {
  return (
    metadataString(wallet.metadata, "session_material") ===
    "encrypted_service_only"
  );
}

export function getDWalletDetailRows(wallet: WalletRegistryRow) {
  const runtimeAccount = getDWalletRuntimeAccount(wallet);
  const authorizedUser = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "authorized_user_pubkey",
  );
  const publicKeyHex = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "public_key_hex",
  );
  const messageMetadataDigest = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "message_metadata_digest",
  );
  const registrationSignature = getDWalletRegistrationSignature(wallet);
  const treasurySignature = getDWalletTreasurySignature(wallet);
  const ownerWallet =
    metadataNestedString(wallet.metadata, "binding", "owner_wallet") ??
    metadataNestedString(wallet.metadata, "treasury_binding", "owner_wallet");
  const providerSessionId = metadataString(
    wallet.metadata,
    "provider_session_id",
  );
  const registrationTxSlot = metadataNestedNumber(
    wallet.metadata,
    "binding",
    "tx_slot",
  );
  const treasuryTxSlot = metadataNestedNumber(
    wallet.metadata,
    "treasury_binding",
    "tx_slot",
  );

  return compactRows([
    {
      label: "Deposit address",
      value: wallet.chain_address,
      explorer: addressExplorerForWallet(wallet, wallet.chain_address),
    },
    wallet.dwallet_id
      ? {
          label: "dWallet ID",
          value: wallet.dwallet_id,
        }
      : null,
    runtimeAccount
      ? {
          label: "Runtime dWallet account",
          value: runtimeAccount,
          explorer: walletAddressExplorerUrl(runtimeAccount),
        }
      : null,
    wallet.dwallet_state_pda
      ? {
          label: "State PDA",
          value: wallet.dwallet_state_pda,
          explorer: walletAddressExplorerUrl(wallet.dwallet_state_pda),
        }
      : null,
    authorizedUser
      ? {
          label: "Authorized user",
          value: authorizedUser,
          explorer: walletAddressExplorerUrl(authorizedUser),
        }
      : null,
    publicKeyHex
      ? {
          label: "Public key hex",
          value: publicKeyHex,
        }
      : null,
    messageMetadataDigest
      ? {
          label: "Metadata digest",
          value: messageMetadataDigest,
        }
      : null,
    wallet.treasury_pda
      ? {
          label: "AURA treasury",
          value: wallet.treasury_pda,
          explorer: walletAddressExplorerUrl(wallet.treasury_pda),
        }
      : null,
    ownerWallet
      ? {
          label: "Owner wallet",
          value: ownerWallet,
          explorer: walletAddressExplorerUrl(ownerWallet),
        }
      : null,
    providerSessionId
      ? {
          label: "Provider session",
          value: providerSessionId,
        }
      : null,
    treasurySignature
      ? {
          label: "Treasury tx",
          value: treasurySignature,
          explorer: walletTransactionExplorerUrl(treasurySignature),
        }
      : null,
    treasuryTxSlot
      ? {
          label: "Treasury tx slot",
          value: String(treasuryTxSlot),
        }
      : null,
    registrationSignature
      ? {
          label: "Registration tx",
          value: registrationSignature,
          explorer: walletTransactionExplorerUrl(registrationSignature),
        }
      : null,
    registrationTxSlot
      ? {
          label: "Registration tx slot",
          value: String(registrationTxSlot),
        }
      : null,
  ]);
}

export function getDWalletDetailsExport(wallet: WalletRegistryRow) {
  return {
    format: "aura-dwallet-details-v1",
    exportedAt: new Date().toISOString(),
    wallet: {
      id: wallet.id,
      label: wallet.label,
      chainId: wallet.chain_id,
      chainName: wallet.chain_name,
      depositAddress: wallet.chain_address,
      dwalletId: wallet.dwallet_id,
      dwalletStatePda: wallet.dwallet_state_pda,
      runtimeDwalletAccount: getDWalletRuntimeAccount(wallet),
      authorizedUserPubkey: metadataNestedString(
        wallet.metadata,
        "dwallet",
        "authorized_user_pubkey",
      ),
      publicKeyHex: metadataNestedString(
        wallet.metadata,
        "dwallet",
        "public_key_hex",
      ),
      messageMetadataDigest: metadataNestedString(
        wallet.metadata,
        "dwallet",
        "message_metadata_digest",
      ),
      auraTreasury: wallet.treasury_pda,
      agentSessionId: wallet.agent_session_id,
      status: wallet.status,
      provider: metadataString(wallet.metadata, "provider"),
      providerSessionId: metadataString(wallet.metadata, "provider_session_id"),
      source: metadataString(wallet.metadata, "source"),
      ownerWallet:
        metadataNestedString(wallet.metadata, "binding", "owner_wallet") ??
        metadataNestedString(
          wallet.metadata,
          "treasury_binding",
          "owner_wallet",
        ),
      treasuryTxSignature: getDWalletTreasurySignature(wallet),
      treasuryTxSlot: metadataNestedNumber(
        wallet.metadata,
        "treasury_binding",
        "tx_slot",
      ),
      treasuryTxBlockTime: metadataNestedString(
        wallet.metadata,
        "treasury_binding",
        "tx_block_time",
      ),
      treasuryLinkedAt: metadataNestedString(
        wallet.metadata,
        "treasury_binding",
        "linked_at",
      ),
      registrationTxSignature: getDWalletRegistrationSignature(wallet),
      registrationTxSlot: metadataNestedNumber(
        wallet.metadata,
        "binding",
        "tx_slot",
      ),
      registrationTxBlockTime: metadataNestedString(
        wallet.metadata,
        "binding",
        "tx_block_time",
      ),
      registrationLinkedAt: metadataNestedString(
        wallet.metadata,
        "binding",
        "linked_at",
      ),
      hasEncryptedSession: getDWalletHasEncryptedSession(wallet),
      createdAt: wallet.created_at,
      updatedAt: wallet.updated_at,
    },
  };
}
