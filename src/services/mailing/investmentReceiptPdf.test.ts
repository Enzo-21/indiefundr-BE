import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvestmentReceiptDocument } from "./investmentReceiptDocument";
import { buildReceiptPdfBuffer } from "./investmentReceiptPdf";

describe("investment receipt pdf", () => {
  it("builds a receipt document for an active investment", () => {
    const document = buildInvestmentReceiptDocument({
      investment: {
        id: "inv-1",
        fundId: "balanced-growth",
        amountUsdt: 25,
        returnPercent90d: 15,
        projectedPayoutUsdt: 28.75,
        subscribedAt: new Date("2026-06-18T12:00:00.000Z"),
        maturesAt: new Date("2026-09-16T12:00:00.000Z"),
        date: new Date("2026-06-18T12:00:00.000Z"),
      } as never,
      order: {
        usdtTxId: "abc123def456",
      } as never,
      fund: {
        id: "balanced-growth",
        name: "Balanced Growth",
        tagline: "",
        returnPercent90d: 15,
        termDays: 90,
        maxOpenInvestments: 5,
        riskLevel: "medium",
        riskLabel: "Medium risk",
        destinations: [],
        accentColor: "#64748B",
        icon: "chart-line",
      },
    });

    assert.equal(document.heading, "Transaction receipt");
    assert.match(document.description, /Balanced Growth/);
    assert.equal(document.sections.length, 2);
  });

  it("generates a non-empty PDF buffer", () => {
    const document = buildInvestmentReceiptDocument({
      investment: {
        id: "inv-1",
        fundId: "balanced-growth",
        amountUsdt: 25,
        returnPercent90d: 15,
        projectedPayoutUsdt: 28.75,
        subscribedAt: new Date("2026-06-18T12:00:00.000Z"),
        maturesAt: new Date("2026-09-16T12:00:00.000Z"),
        date: new Date("2026-06-18T12:00:00.000Z"),
      } as never,
      order: {
        usdtTxId: "abc123def456",
      } as never,
      fund: {
        id: "balanced-growth",
        name: "Balanced Growth",
        tagline: "",
        returnPercent90d: 15,
        termDays: 90,
        maxOpenInvestments: 5,
        riskLevel: "medium",
        riskLabel: "Medium risk",
        destinations: [],
        accentColor: "#64748B",
        icon: "chart-line",
      },
    });

    const buffer = buildReceiptPdfBuffer(document);
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  });
});
