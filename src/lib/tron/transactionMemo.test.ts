import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  buildIndieFundrMemo,
  memoFromTransactionRawData,
  parseIndieFundrMemo,
} from "./transactionMemo";

const ORIGINAL_ENV = { ...process.env };

describe("transactionMemo", () => {
  beforeEach(() => {
    process.env.INDIEFUNDR_CHAIN_MEMO_VERSION = "1";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("round-trips invest memo", () => {
    const memo = buildIndieFundrMemo({
      kind: "invest",
      fundId: "growth",
      entityId: "674a1b2c3d4e5f6789012345",
      version: 1,
    });
    assert.equal(memo, "INDIEFUNDR/1/invest/growth/674a1b2c3d4e5f6789012345");
    assert.deepEqual(parseIndieFundrMemo(memo), {
      version: 1,
      kind: "invest",
      fundId: "growth",
      entityId: "674a1b2c3d4e5f6789012345",
    });
  });

  it("returns null for non-IndieFundr memo", () => {
    assert.equal(parseIndieFundrMemo("hello"), null);
    assert.equal(parseIndieFundrMemo(null), null);
  });

  it("returns null for wrong version", () => {
    assert.equal(
      parseIndieFundrMemo("INDIEFUNDR/99/invest/growth/674a1b2c3d4e5f6789012345"),
      null
    );
  });

  it("decodes hex raw_data.data to utf8", () => {
    const hex = Buffer.from(
      "INDIEFUNDR/1/invest/growth/674a1b2c3d4e5f6789012345",
      "utf8"
    ).toString("hex");
    assert.equal(
      memoFromTransactionRawData(hex),
      "INDIEFUNDR/1/invest/growth/674a1b2c3d4e5f6789012345"
    );
  });
});
