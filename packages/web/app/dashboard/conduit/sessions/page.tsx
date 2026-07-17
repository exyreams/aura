import { ConduitSessionManager } from "@/components/agents/ConduitSessionManager";

export default function ConduitSessionsPage() {
  return (
    <ConduitSessionManager
      eyebrow="Conduit sessions"
      title="Authorized Conduit access"
      description="Manage agent runtime tokens tied to your authenticated AURA account. Revocation stops Conduit access while owner wallet authority and on-chain state remain unchanged."
    />
  );
}
