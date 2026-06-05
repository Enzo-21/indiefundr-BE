import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendAutopilotNote,
  formatOrderAutopilotManualCheckNote,
} from "@/lib/admin/autopilotBatch";

describe("withdrawal autopilot manual-check notes", () => {
  it("formatOrderAutopilotManualCheckNote matches purchase autopilot format", () => {
    const at = new Date("2026-06-03T12:00:00.000Z");
    const line = formatOrderAutopilotManualCheckNote("USDT broadcast failed", at);
    assert.equal(
      line,
      "[Autopilot 2026-06-03] Manual check needed — USDT broadcast failed"
    );
  });

  it("appendAutopilotNote preserves existing withdrawal admin notes", () => {
    assert.equal(
      appendAutopilotNote("Prior admin note", "[Autopilot] Manual check needed — x"),
      "Prior admin note\n[Autopilot] Manual check needed — x"
    );
    assert.equal(
      appendAutopilotNote(null, "[Autopilot 2026-06-03] Manual check needed — x"),
      "[Autopilot 2026-06-03] Manual check needed — x"
    );
  });
});
