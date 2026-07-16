import { strict as assert } from "node:assert";
import { test } from "node:test";

import { TocTouGuard } from "../src/core/toctou.js";

test("issued ticket verifies for matching session + args", () => {
  const g = new TocTouGuard();
  const t = g.issue({ sessionId: "ses_x", subjectArgs: { a: 1, b: 2 } });
  const result = g.verify({
    ticket: t.ticket,
    sessionId: "ses_x",
    subjectArgs: { b: 2, a: 1 },
  });
  assert.equal(result.ok, true);
});

test("ticket fails on session mismatch", () => {
  const g = new TocTouGuard();
  const t = g.issue({ sessionId: "ses_x", subjectArgs: { a: 1 } });
  const result = g.verify({
    ticket: t.ticket,
    sessionId: "ses_other",
    subjectArgs: { a: 1 },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "session_mismatch");
});

test("ticket fails on args mismatch", () => {
  const g = new TocTouGuard();
  const t = g.issue({ sessionId: "ses_x", subjectArgs: { amount: 100 } });
  const result = g.verify({
    ticket: t.ticket,
    sessionId: "ses_x",
    subjectArgs: { amount: 999 },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "args_mismatch");
});

test("ticket expires after TTL", () => {
  let now = 1_000_000;
  const g = new TocTouGuard({ now: () => now });
  const t = g.issue({ sessionId: "ses_x", subjectArgs: { a: 1 }, ttlSecs: 60 });
  now += 120_000;
  const result = g.verify({
    ticket: t.ticket,
    sessionId: "ses_x",
    subjectArgs: { a: 1 },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "expired");
});

test("malformed tickets are rejected without crashing", () => {
  const g = new TocTouGuard();
  const result = g.verify({
    ticket: "not-a-ticket",
    sessionId: "ses_x",
    subjectArgs: {},
  });
  assert.equal(result.ok, false);
});

test("tickets signed with one secret do not verify with another", () => {
  const a = new TocTouGuard({ secret: Buffer.alloc(32, 1) });
  const b = new TocTouGuard({ secret: Buffer.alloc(32, 2) });
  const t = a.issue({ sessionId: "ses_x", subjectArgs: { a: 1 } });
  const result = b.verify({
    ticket: t.ticket,
    sessionId: "ses_x",
    subjectArgs: { a: 1 },
  });
  assert.equal(result.ok, false);
});
