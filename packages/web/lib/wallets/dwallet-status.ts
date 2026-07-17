import type { WalletRegistryRow } from "@/lib/supabase/types";
import {
  getDWalletRegistrationSignature,
  metadataString,
} from "@/lib/wallets/dwallet-details";

export type DWalletStatusTone = "neutral" | "success" | "warning" | "danger";

export interface DWalletStatusModel {
  statusLabel: string;
  statusTone: DWalletStatusTone;
  bindingLabel: string;
  bindingTone: DWalletStatusTone;
  nextActionLabel: string | null;
  nextActionDescription: string | null;
  isOnchainRegistered: boolean;
  isOwnerLinkRequired: boolean;
  canRemove: boolean;
}

export function isAgentCreatedDWallet(wallet: WalletRegistryRow) {
  return metadataString(wallet.metadata, "created_via") === "conduit_agent";
}

export function hasRecordedDWalletRegistration(wallet: WalletRegistryRow) {
  return Boolean(getDWalletRegistrationSignature(wallet));
}

export function canRemoveDWalletRecord(wallet: WalletRegistryRow) {
  return (
    wallet.wallet_kind === "dwallet" &&
    wallet.status !== "onchain_registered" &&
    metadataString(wallet.metadata, "onchain_registration") !== "recorded" &&
    !hasRecordedDWalletRegistration(wallet)
  );
}

export function getDWalletStatusModel(
  wallet: WalletRegistryRow,
): DWalletStatusModel {
  const isOnchainRegistered = wallet.status === "onchain_registered";
  const isOwnerLinkRequired = !isOnchainRegistered;
  const hasTreasury = Boolean(wallet.treasury_pda);

  if (isOnchainRegistered) {
    return {
      statusLabel: "on-chain registered",
      statusTone: "success",
      bindingLabel: "on-chain",
      bindingTone: "success",
      nextActionLabel: null,
      nextActionDescription: null,
      isOnchainRegistered,
      isOwnerLinkRequired,
      canRemove: false,
    };
  }

  if (wallet.status === "ika_provisioned") {
    return {
      statusLabel: "provisioned",
      statusTone: "success",
      bindingLabel: hasTreasury ? "registration pending" : "treasury pending",
      bindingTone: "warning",
      nextActionLabel: "Link from dashboard",
      nextActionDescription: hasTreasury
        ? "Register this dWallet on-chain with the owner wallet before an agent can execute from it."
        : "Create the signer agent treasury with the owner wallet, then register this dWallet on-chain.",
      isOnchainRegistered,
      isOwnerLinkRequired,
      canRemove: canRemoveDWalletRecord(wallet),
    };
  }

  if (wallet.status === "agent_created_pending") {
    return {
      statusLabel: "link from dashboard",
      statusTone: "warning",
      bindingLabel: "owner link required",
      bindingTone: "warning",
      nextActionLabel: "Link from dashboard",
      nextActionDescription:
        "This wallet was recorded by an agent runtime. Review the details, then link it with the owner wallet before agent execution can use it.",
      isOnchainRegistered,
      isOwnerLinkRequired,
      canRemove: canRemoveDWalletRecord(wallet),
    };
  }

  if (wallet.status === "metadata_registered") {
    return {
      statusLabel: "metadata registered",
      statusTone: "warning",
      bindingLabel: hasTreasury ? "registration pending" : "treasury pending",
      bindingTone: "warning",
      nextActionLabel: "Link from dashboard",
      nextActionDescription: hasTreasury
        ? "This wallet is fundable now. Register it on-chain with the owner wallet before agent execution can use it."
        : "This wallet is fundable now, but its signer agent has no AURA treasury PDA yet. Link on-chain will create the treasury with your owner wallet, then register the dWallet.",
      isOnchainRegistered,
      isOwnerLinkRequired,
      canRemove: canRemoveDWalletRecord(wallet),
    };
  }

  return {
    statusLabel: wallet.status.replaceAll("_", " "),
    statusTone: wallet.status === "unknown" ? "warning" : "neutral",
    bindingLabel: hasTreasury ? "registration pending" : "treasury pending",
    bindingTone: "warning",
    nextActionLabel: "Review wallet",
    nextActionDescription:
      "Review this wallet's metadata and complete owner-side linking before agent execution can use it.",
    isOnchainRegistered,
    isOwnerLinkRequired,
    canRemove: canRemoveDWalletRecord(wallet),
  };
}
