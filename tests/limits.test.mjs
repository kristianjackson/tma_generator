import test from "node:test";
import assert from "node:assert/strict";
import { getDailyLimit, getWindowStart, isLimitReached } from "../app/lib/limits.ts";

test("limits: window start is 24h before now", () => {
  const now = Date.now();
  const start = getWindowStart(now);
  assert.ok(now - start >= 24 * 60 * 60 * 1000 - 5);
});

test("limits: isLimitReached", () => {
  assert.equal(isLimitReached(5, 5), true);
  assert.equal(isLimitReached(4, 5), false);
});

test("limits: getDailyLimit falls back to default", () => {
  const original = process.env.RUN_DAILY_LIMIT;
  process.env.RUN_DAILY_LIMIT = "not-a-number";
  assert.equal(getDailyLimit(), 5);
  process.env.RUN_DAILY_LIMIT = original;
});
