import test from "node:test";
import assert from "node:assert/strict";
import { formatRunStatus, getContinueRoute } from "../app/lib/run-status.ts";

test("run-status: formats known statuses", () => {
  assert.equal(formatRunStatus("seeded"), "Seeded");
  assert.equal(formatRunStatus("outline_pending"), "Generating outline");
  assert.equal(formatRunStatus("outlined"), "Outlined");
  assert.equal(formatRunStatus("draft_pending"), "Generating draft");
  assert.equal(formatRunStatus("drafted"), "Drafted");
  assert.equal(formatRunStatus("final"), "Finalized");
});

test("run-status: preserves unknown status", () => {
  assert.equal(formatRunStatus("custom"), "custom");
});

test("run-status: returns continue route by status", () => {
  const runId = "run-123";
  assert.equal(getContinueRoute(runId, "seeded"), `/generate/step-2?run=${runId}`);
  assert.equal(
    getContinueRoute(runId, "outline_pending"),
    `/generate/step-2?run=${runId}`
  );
  assert.equal(getContinueRoute(runId, "outlined"), `/generate/step-3?run=${runId}`);
  assert.equal(
    getContinueRoute(runId, "draft_pending"),
    `/generate/step-3?run=${runId}`
  );
  assert.equal(getContinueRoute(runId, "drafted"), `/generate/review?run=${runId}`);
  assert.equal(getContinueRoute(runId, "final"), `/runs/${runId}`);
});

test("run-status: falls back to run detail for unknown statuses", () => {
  assert.equal(getContinueRoute("run-123", "unknown"), "/runs/run-123");
});
