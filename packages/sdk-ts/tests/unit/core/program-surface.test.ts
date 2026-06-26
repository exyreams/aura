/**
 * Program-surface metadata catalog.
 *
 * Ensures the domain catalog is complete and consistent with the IDL: every
 * instruction is mapped to exactly one of the 13 domains, and the flat feature
 * list round-trips against the IDL instruction set.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  AURA_FEATURE_DOMAINS,
  AURA_IDL,
  AURA_INSTRUCTION_DOMAINS,
  AURA_INSTRUCTION_FEATURES,
  getAuraFeatureDomain,
  getInstructionDomain,
} from "../../../src/index.js";

const DOMAIN_IDS = [
  "treasury",
  "confidential",
  "execution",
  "governance",
  "dwallet",
  "policy",
  "budget",
  "operational",
  "lifecycle",
  "swarm",
  "fees",
  "address-lists",
  "batch",
] as const;

const idlNames = AURA_IDL.instructions.map((ix) => ix.name).sort();

test("there are exactly 13 feature domains with unique ids", () => {
  assert.equal(AURA_FEATURE_DOMAINS.length, 13);
  const ids = AURA_FEATURE_DOMAINS.map((d) => d.id).sort();
  assert.deepEqual(ids, [...DOMAIN_IDS].sort());
  for (const domain of AURA_FEATURE_DOMAINS) {
    assert.ok(domain.label.length > 0, domain.id);
    assert.ok(domain.description.length > 0, domain.id);
  }
});

test("every IDL instruction is mapped to a valid domain", () => {
  assert.equal(Object.keys(AURA_INSTRUCTION_DOMAINS).length, idlNames.length);
  for (const name of idlNames) {
    const domain = getInstructionDomain(name);
    assert.ok(domain, `unmapped instruction ${name}`);
    assert.ok(
      DOMAIN_IDS.includes(domain as (typeof DOMAIN_IDS)[number]),
      `invalid domain ${domain} for ${name}`,
    );
    assert.equal(AURA_INSTRUCTION_DOMAINS[name], domain);
  }
});

test("getInstructionDomain returns undefined for unknown instructions", () => {
  assert.equal(getInstructionDomain("does_not_exist"), undefined);
});

test("the flat feature list round-trips against the IDL", () => {
  assert.equal(AURA_INSTRUCTION_FEATURES.length, idlNames.length);
  const featureNames = AURA_INSTRUCTION_FEATURES.map((f) => f.name).sort();
  assert.deepEqual(featureNames, idlNames);
  for (const feature of AURA_INSTRUCTION_FEATURES) {
    assert.ok(feature.label.length > 0, feature.name);
    assert.ok(feature.description.length > 0, feature.name);
    assert.equal(feature.domain, getInstructionDomain(feature.name));
  }
});

test("each domain's instruction list matches its mapped members", () => {
  let total = 0;
  for (const domain of AURA_FEATURE_DOMAINS) {
    for (const feature of domain.instructions) {
      assert.equal(getInstructionDomain(feature.name), domain.id, feature.name);
      total += 1;
    }
    assert.equal(getAuraFeatureDomain(domain.id)?.id, domain.id);
  }
  assert.equal(total, idlNames.length);
});

test("maturity values are within the documented union", () => {
  const allowed = new Set(["wallet", "backend", "read_only", "external_cpi"]);
  for (const feature of AURA_INSTRUCTION_FEATURES) {
    assert.ok(
      allowed.has(feature.maturity),
      `${feature.name}:${feature.maturity}`,
    );
  }
});
