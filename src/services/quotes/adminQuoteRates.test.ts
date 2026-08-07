import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAdminQuotePairMeta,
  isAdminQuotePairId,
  ADMIN_QUOTE_PAIRS,
} from "./adminQuotePairRegistry";
import { mapUsdtArsSnapshotToAdminQuoteRate } from "./adminQuoteRates";
import { USDT_ARS_QUOTE_MAX_AGE_MS } from "./refreshUsdtArsQuote";

describe("adminQuotePairRegistry", () => {
  it("lists usdt-ars as the default pair", () => {
    assert.equal(ADMIN_QUOTE_PAIRS.length, 1);
    assert.equal(ADMIN_QUOTE_PAIRS[0]?.id, "usdt-ars");
    assert.equal(isAdminQuotePairId("usdt-ars"), true);
    assert.equal(isAdminQuotePairId("usdt-brl"), false);
  });

  it("resolves known pair meta and rejects unknown ids", () => {
    const meta = getAdminQuotePairMeta("usdt-ars");
    assert.equal(meta.label, "USDT / ARS");
    assert.equal(meta.quote, "ARS");
    assert.throws(() => getAdminQuotePairMeta("usdt-brl"), /Unknown quote pair/);
  });
});

describe("mapUsdtArsSnapshotToAdminQuoteRate", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");

  it("maps missing snapshot to unavailable stale dto", () => {
    const dto = mapUsdtArsSnapshotToAdminQuoteRate(null, now);
    assert.equal(dto.pairId, "usdt-ars");
    assert.equal(dto.status, "unavailable");
    assert.equal(dto.rate, null);
    assert.equal(dto.stale, true);
  });

  it("maps available fresh snapshot", () => {
    const dto = mapUsdtArsSnapshotToAdminQuoteRate(
      {
        arsPerUsdt: 1620.5,
        status: "available",
        source: "criptoya",
        sourceDetail: "universalcoins",
        fetchedAt: new Date(now.getTime() - 60_000),
        lastError: null,
      },
      now
    );
    assert.equal(dto.status, "available");
    assert.equal(dto.rate, 1620.5);
    assert.equal(dto.stale, false);
    assert.equal(dto.source, "criptoya");
    assert.equal(dto.fetchedAt, "2026-08-07T11:59:00.000Z");
  });

  it("marks available but old snapshot as stale", () => {
    const dto = mapUsdtArsSnapshotToAdminQuoteRate(
      {
        arsPerUsdt: 1600,
        status: "available",
        source: "dolarapi",
        sourceDetail: "cripto.venta",
        fetchedAt: new Date(now.getTime() - USDT_ARS_QUOTE_MAX_AGE_MS - 1),
        lastError: null,
      },
      now
    );
    assert.equal(dto.status, "available");
    assert.equal(dto.stale, true);
  });

  it("maps unavailable snapshot with lastError", () => {
    const dto = mapUsdtArsSnapshotToAdminQuoteRate(
      {
        arsPerUsdt: null,
        status: "unavailable",
        source: null,
        sourceDetail: null,
        fetchedAt: now,
        lastError: "criptoya: timeout | dolarapi: 500",
      },
      now
    );
    assert.equal(dto.status, "unavailable");
    assert.equal(dto.stale, true);
    assert.equal(dto.lastError, "criptoya: timeout | dolarapi: 500");
  });
});
