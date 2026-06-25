/**
 * Security helpers: keypair file hygiene and instruction risk classification.
 *
 * These feed the runner's guard rails. None of them block legitimate use; they
 * surface warnings and decide when an explicit confirmation is warranted.
 */

import { statSync } from "node:fs";

import { expandHome } from "./config.js";

export type RiskLevel = "normal" | "caution" | "danger";

export interface InstructionRisk {
  level: RiskLevel;
  /** Why the instruction is sensitive — shown in the confirmation prompt. */
  reason?: string;
}

/**
 * Classifies a (snake_case) instruction name by blast radius so the runner can
 * decide whether to require confirmation. This is intentionally conservative:
 * authority changes, recovery, shutdowns, and account closures all prompt.
 */
export function classifyInstructionRisk(name: string): InstructionRisk {
  const n = name.toLowerCase();

  // Highest blast radius: emergency, ownership, recovery, kill-switches.
  if (n.includes("emergency") || n.includes("shutdown")) {
    return {
      level: "danger",
      reason: "emergency action affecting treasury availability",
    };
  }
  if (n.startsWith("break_glass")) {
    return { level: "danger", reason: "break-glass recovery override" };
  }
  if (
    n.includes("transfer_authority") ||
    n.includes("ownership_handover") ||
    n.startsWith("nominate_successor")
  ) {
    return { level: "danger", reason: "changes treasury ownership/authority" };
  }
  if (n.includes("dead_mans_switch")) {
    return { level: "danger", reason: "triggers the dead-man's switch" };
  }
  if (n.includes("revoke") || n.includes("rotate")) {
    return {
      level: "danger",
      reason: "revokes or rotates an authority/credential",
    };
  }

  // Governance and recovery configuration: sensitive but routine.
  if (
    n.includes("multisig") ||
    n.includes("override") ||
    n.includes("recovery_destination") ||
    n.includes("guardian") ||
    n.startsWith("configure_trust") ||
    n.includes("operator_role")
  ) {
    return { level: "caution", reason: "modifies governance / access control" };
  }

  // Account closures (reclaim rent, drop state) and migrations.
  if (
    n.startsWith("close_") ||
    n.startsWith("remove_") ||
    n.startsWith("migrate_") ||
    n === "disable_confidential_guardrails"
  ) {
    return { level: "caution", reason: "closes or removes on-chain state" };
  }

  return { level: "normal" };
}

export interface WalletHygiene {
  /** A warning to surface, or null when the file looks fine / unchecked. */
  warning: string | null;
}

/**
 * Checks keypair file permissions on POSIX systems. A keypair readable by group
 * or others is a credential-leak risk. No-ops on Windows, where POSIX mode bits
 * do not apply.
 */
export function checkWalletFileHygiene(walletPath: string): WalletHygiene {
  if (process.platform === "win32") {
    return { warning: null };
  }
  try {
    const resolved = expandHome(walletPath);
    const mode = statSync(resolved).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      const octal = mode.toString(8).padStart(3, "0");
      return {
        warning: `Keypair ${resolved} is readable by group/others (mode ${octal}). Run: chmod 600 ${resolved}`,
      };
    }
  } catch {
    // File missing or unreadable — surfaced elsewhere when actually loaded.
    return { warning: null };
  }
  return { warning: null };
}
