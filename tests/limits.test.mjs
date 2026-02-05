import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultDailyLimit,
  getWindowStart,
  isLimitReached,
  parseDailyLimitValue
} from "../app/lib/limits.ts";

test("limits: window start is 24h before now", () => {
  const now = Date.now();
  const start = getWindowStart(now);
  assert.ok(now - start >= 24 * 60 * 60 * 1000 - 5);
});

test("limits: isLimitReached", () => {
  assert.equal(isLimitReached(5, 5), true);
  assert.equal(isLimitReached(4, 5), false);
  assert.equal(isLimitReached(100, 0), false);
});

test("limits: parseDailyLimitValue", () => {
  assert.equal(parseDailyLimitValue("10"), 10);
  assert.equal(parseDailyLimitValue(3), 3);
  assert.equal(parseDailyLimitValue("-1"), 0);
  assert.equal(parseDailyLimitValue("nope"), null);
  assert.equal(parseDailyLimitValue(null), null);
});

test("limits: getDefaultDailyLimit falls back to default", () => {
  const original = process.env.RUN_DAILY_LIMIT;
  process.env.RUN_DAILY_LIMIT = "not-a-number";
  assert.equal(getDefaultDailyLimit(), 5);
  process.env.RUN_DAILY_LIMIT = original;
});
