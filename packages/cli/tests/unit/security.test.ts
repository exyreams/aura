/** Instruction risk classification and keypair hygiene. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkWalletFileHygiene,
  classifyInstructionRisk,
} from "../../src/core/security.js";

test("emergency, break-glass, and authority changes are danger", () => {
  for (const name of [
    "emergency_shutdown",
    "emergency_revoke_agent",
    "break_glass_recover",
    "break_glass_transfer_authority",
    "rotate_dwallet_authority",
    "revoke_agent",
    "trigger_dead_mans_switch",
    "nominate_successor_owner",
    "execute_ownership_handover",
  ]) {
    assert.equal(classifyInstructionRisk(name).level, "danger", name);
  }
});

test("governance, access-control, and closures are caution", () => {
  for (const name of [
    "configure_multisig",
    "propose_override",
    "collect_override_signature",
    "grant_operator_role",
    "register_recovery_destination",
    "close_treasury_analytics",
    "remove_budget_envelope",
    "migrate_treasury",
  ]) {
    assert.equal(classifyInstructionRisk(name).level, "caution", name);
  }
});

test("routine instructions are normal", () => {
  for (const name of [
    "create_treasury",
    "propose_transaction",
    "set_recipient_limit",
    "init_health_score",
    "take_snapshot",
  ]) {
    assert.equal(classifyInstructionRisk(name).level, "normal", name);
  }
});

test("danger/caution classifications include a reason", () => {
  assert.ok(classifyInstructionRisk("emergency_shutdown").reason);
  assert.ok(classifyInstructionRisk("configure_multisig").reason);
  assert.equal(classifyInstructionRisk("create_treasury").reason, undefined);
});

test("checkWalletFileHygiene returns no warning for a missing file", () => {
  assert.equal(
    checkWalletFileHygiene("/definitely/not/a/real/keypair.json").warning,
    null,
  );
});
