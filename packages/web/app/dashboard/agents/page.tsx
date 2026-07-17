import { ConduitSessionManager } from "@/components/agents/ConduitSessionManager";

export default function AgentsPage() {
  return (
    <ConduitSessionManager
      allowCreateSigner
      eyebrow="Agents"
      title="Authorized agent sessions"
      description="Create user-owned signer agents, approve Conduit-created agent sessions, and manage scopes, usage, expiry, and revocation from one account-owned surface."
    />
  );
}
