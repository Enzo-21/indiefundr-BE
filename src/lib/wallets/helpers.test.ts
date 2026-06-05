import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chainTransferLabel } from "./helpers";

describe("chainTransferLabel", () => {
  it("returns Receiving USDT for pending incoming", () => {
    assert.equal(chainTransferLabel("in", "pending"), "Receiving USDT");
  });

  it("returns USDT received for confirmed incoming", () => {
    assert.equal(chainTransferLabel("in", "confirmed"), "USDT received");
  });

  it("returns USDT sent for outgoing regardless of status", () => {
    assert.equal(chainTransferLabel("out", "pending"), "USDT sent");
    assert.equal(chainTransferLabel("out", "confirmed"), "USDT sent");
  });
});
