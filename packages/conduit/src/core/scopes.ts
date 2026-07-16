import { ConduitError } from "./errors.js";
import type { Session, Tool } from "./types.js";

/**
 * Throws `ConduitError("forbidden")` if the session lacks any of the tool's
 * required scopes. No-op when `requiredScopes` is empty.
 */
export function assertScopeAllowed(session: Session, tool: Tool): void {
  for (const scope of tool.requiredScopes) {
    if (!session.scopes.includes(scope)) {
      throw new ConduitError(
        "forbidden",
        `session is missing required scope '${scope}' for tool '${tool.name}'`,
        { sessionId: session.id, tool: tool.name, requiredScope: scope },
      );
    }
  }
}
