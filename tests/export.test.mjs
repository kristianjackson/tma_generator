import test from "node:test";
import assert from "node:assert/strict";
import { buildExportName, buildFileBase } from "../app/lib/export.ts";

test("export: buildFileBase sanitizes input", () => {
  assert.equal(buildFileBase("MAG 001 - Anglerfish"), "mag-001-anglerfish");
  assert.equal(buildFileBase("   "), "tma-story");
});

test("export: buildExportName adds date and extension", () => {
  const date = new Date("2026-02-05T12:00:00Z");
  const name = buildExportName("Run One", "txt", date);
  assert.equal(name, "run-one-2026-02-05.txt");
});
