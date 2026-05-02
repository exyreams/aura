/** Operational liveness, health, snapshot, and activity-log instruction builders. */

import type { AuraClient } from "../client.js";

/** Builds `init_external_liveness`. */
export function initExternalLivenessInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initExternalLivenessInstruction"]>
): ReturnType<AuraClient["initExternalLivenessInstruction"]> {
  return client.initExternalLivenessInstruction(...args);
}

/** Builds `refresh_external_liveness`. */
export function refreshExternalLivenessInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["refreshExternalLivenessInstruction"]>
): ReturnType<AuraClient["refreshExternalLivenessInstruction"]> {
  return client.refreshExternalLivenessInstruction(...args);
}

/** Builds `set_scoped_pause`. */
export function setScopedPauseInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["setScopedPauseInstruction"]>
): ReturnType<AuraClient["setScopedPauseInstruction"]> {
  return client.setScopedPauseInstruction(...args);
}

/** Builds `init_health_score`. */
export function initHealthScoreInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initHealthScoreInstruction"]>
): ReturnType<AuraClient["initHealthScoreInstruction"]> {
  return client.initHealthScoreInstruction(...args);
}

/** Builds `refresh_health_score`. */
export function refreshHealthScoreInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["refreshHealthScoreInstruction"]>
): ReturnType<AuraClient["refreshHealthScoreInstruction"]> {
  return client.refreshHealthScoreInstruction(...args);
}

/** Builds `close_health_score`. */
export function closeHealthScoreInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeHealthScoreInstruction"]>
): ReturnType<AuraClient["closeHealthScoreInstruction"]> {
  return client.closeHealthScoreInstruction(...args);
}

/** Builds `take_snapshot`. */
export function takeSnapshotInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["takeSnapshotInstruction"]>
): ReturnType<AuraClient["takeSnapshotInstruction"]> {
  return client.takeSnapshotInstruction(...args);
}

/** Builds `close_snapshot`. */
export function closeSnapshotInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeSnapshotInstruction"]>
): ReturnType<AuraClient["closeSnapshotInstruction"]> {
  return client.closeSnapshotInstruction(...args);
}

/** Builds `init_activity_log`. */
export function initActivityLogInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["initActivityLogInstruction"]>
): ReturnType<AuraClient["initActivityLogInstruction"]> {
  return client.initActivityLogInstruction(...args);
}

/** Builds `close_activity_log`. */
export function closeActivityLogInstruction(
  client: AuraClient,
  ...args: Parameters<AuraClient["closeActivityLogInstruction"]>
): ReturnType<AuraClient["closeActivityLogInstruction"]> {
  return client.closeActivityLogInstruction(...args);
}
