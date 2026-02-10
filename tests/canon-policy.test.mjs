import test from "node:test";
import assert from "node:assert/strict";
import { allowsCanonCarryover } from "../app/lib/canon-policy.ts";

test("canon-policy: allows continuation prompts", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "continue from anglerfish with a new witness",
      notes: ""
    }),
    true
  );
});

test("canon-policy: allows when includeCast is enabled", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      includeCast: true
    }),
    true
  );
});

test("canon-policy: allows when cast filters are selected", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      cast: ["Jon", "Martin"]
    }),
    true
  );
});

test("canon-policy: rejects by default when no canon signal is present", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "a new technician notices the data center is taking pieces of them"
    }),
    false
  );
});

