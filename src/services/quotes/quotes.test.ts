import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickMaxAskFromCriptoYaPayload } from "./criptoyaUsdtArs";
import { parseDolarApiCriptoVenta } from "./dolarApiCripto";
import { isUsdtArsQuoteFresh } from "./refreshUsdtArsQuote";

describe("pickMaxAskFromCriptoYaPayload", () => {
  it("picks max positive ask and ignores zeros", () => {
    const picked = pickMaxAskFromCriptoYaPayload({
      huobip2p: { ask: 0, bid: 1000 },
      lemoncash: { ask: 1500, bid: 1490 },
      universalcoins: { ask: 1620, bid: 1540 },
      buenbit: { ask: 1598, bid: 1562 },
    });
    assert.deepEqual(picked, {
      arsPerUsdt: 1620,
      exchangeKey: "universalcoins",
    });
  });

  it("returns null when no positive asks", () => {
    assert.equal(
      pickMaxAskFromCriptoYaPayload({ a: { ask: 0 }, b: { ask: -1 } }),
      null
    );
  });
});

describe("parseDolarApiCriptoVenta", () => {
  it("reads venta", () => {
    assert.equal(
      parseDolarApiCriptoVenta({ compra: 1566, venta: 1571.05 }),
      1571.05
    );
  });

  it("rejects invalid venta", () => {
    assert.equal(parseDolarApiCriptoVenta({ venta: 0 }), null);
    assert.equal(parseDolarApiCriptoVenta({}), null);
  });
});

describe("isUsdtArsQuoteFresh", () => {
  it("rejects missing and stale fetchedAt", () => {
    const now = new Date("2026-08-07T12:00:00.000Z");
    assert.equal(isUsdtArsQuoteFresh(null, now), false);
    assert.equal(
      isUsdtArsQuoteFresh(new Date("2026-08-07T11:44:00.000Z"), now),
      false
    );
    assert.equal(
      isUsdtArsQuoteFresh(new Date("2026-08-07T11:50:00.000Z"), now),
      true
    );
  });
});
