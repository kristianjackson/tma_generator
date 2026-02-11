import test from "node:test";
import assert from "node:assert/strict";
import {
  allowsCanonCarryover,
  allowsCastCarryover
} from "../app/lib/canon-policy.ts";

test("canon-policy: allows continuation prompts", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "continue from anglerfish with a new witness",
      notes: ""
    }),
    true
  );
});

test("canon-policy: rejects by default when includeCast is enabled", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      includeCast: true
    }),
    false
  );
});

test("canon-policy: rejects by default with legacy include_cast flag", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      include_cast: "yes"
    }),
    false
  );
});

test("canon-policy: rejects by default when cast filters are selected", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      cast: ["Jon", "Martin"]
    }),
    false
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

test("canon-policy: allows explicit canon flag", () => {
  assert.equal(
    allowsCanonCarryover({
      seed: "new statement in a server room",
      allowCanon: true
    }),
    true
  );
});

test("canon-policy: cast carryover allows includeCast", () => {
  assert.equal(
    allowsCastCarryover({
      seed: "new statement in a server room",
      includeCast: true
    }),
    true
  );
});

test("canon-policy: cast carryover allows selected cast", () => {
  assert.equal(
    allowsCastCarryover({
      seed: "new statement in a server room",
      cast: ["Jon", "Martin"]
    }),
    true
  );
});
