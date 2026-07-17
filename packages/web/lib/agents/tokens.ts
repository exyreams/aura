import { createHash, randomBytes } from "node:crypto";

const AGENT_TOKEN_PREFIX = "aurak";

export function mintAgentToken() {
  return `${AGENT_TOKEN_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashAgentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
