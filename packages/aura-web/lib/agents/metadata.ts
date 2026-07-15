import type { Json } from "@/lib/supabase/types";

export function readAgentMetadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

export function getAgentAuthorityPublicKey(metadata: Json) {
  return (
    readAgentMetadataString(metadata, "publicKey") ||
    readAgentMetadataString(metadata, "authority_public_key")
  );
}

export function getAgentIdentityStatus(metadata: Json) {
  return readAgentMetadataString(metadata, "identity_status") || "session_only";
}

export function getAgentOnchainStatus(metadata: Json) {
  return readAgentMetadataString(metadata, "onchain_status") || "not_bound";
}
