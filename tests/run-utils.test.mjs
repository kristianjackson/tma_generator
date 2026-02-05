import test from "node:test";
import assert from "node:assert/strict";
import { getRunDisplayName } from "../app/lib/run-utils.ts";

test("run-utils: prefers title", () => {
  assert.equal(getRunDisplayName("Named Run", "Seed"), "Named Run");
});

test("run-utils: falls back to seed", () => {
  assert.equal(getRunDisplayName("", "Seed idea"), "Seed idea");
});

test("run-utils: handles empty values", () => {
  assert.equal(getRunDisplayName("", ""), "Untitled run");
});
