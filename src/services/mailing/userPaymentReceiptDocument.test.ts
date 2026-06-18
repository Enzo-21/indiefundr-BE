import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReferralPayoutOrderKind } from "@prisma/client";
import { buildReceiptPdfBuffer } from "./investmentReceiptPdf";
import {
  buildInvestmentPayoutReceiptDocument,
  buildReferralPayoutReceiptDocument,
  buildUserPaymentReceiptDocument,
  buildWithdrawalReceiptDocument,
  referralOrderKindToUserPaymentKind,
  userPaymentReceiptFilename,
} from "./userPaymentReceiptDocument";

const fund = {
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
};

describe("userPaymentReceiptDocument", () => {
  it("maps referral order kinds to user payment kinds", () => {
    assert.equal(
      referralOrderKindToUserPaymentKind(ReferralPayoutOrderKind.invitee_bonus),
      "referral_invitee_bonus"
    );
    assert.equal(
      referralOrderKindToUserPaymentKind(ReferralPayoutOrderKind.inviter_bonus),
      "referral_inviter_bonus"
    );
    assert.equal(
      referralOrderKindToUserPaymentKind(
        ReferralPayoutOrderKind.principal_recovery
      ),
      "principal_recovery"
    );
  });

  it("builds investment payout receipt with earnings and positive amount", () => {
    const document = buildInvestmentPayoutReceiptDocument({
      investment: {
        id: "inv-1",
        fundId: "balanced-growth",
        amountUsdt: 25,
        returnPercent90d: 15,
        projectedPayoutUsdt: 28.75,
        subscribedAt: new Date("2026-01-01T12:00:00.000Z"),
        maturesAt: new Date("2026-04-01T12:00:00.000Z"),
        redeemedAt: new Date("2026-03-15T12:00:00.000Z"),
        date: new Date("2026-01-01T12:00:00.000Z"),
      } as never,
      fund,
      txId: "payout-tx-abc123",
    });

    assert.equal(document.heading, "Payout receipt");
    assert.match(document.amount, /^\+28\.75 USDT$/);
    const allLines = document.sections.flatMap((section) => section.lines);
    assert.ok(
      allLines.some((line) => line.label === "Earnings" && line.value.includes("3.75"))
    );
    assert.ok(
      allLines.every((line) => line.label !== "TronScan"),
      "receipt should not include TronScan"
    );
  });

  it("builds referral invitee bonus receipt", () => {
    const document = buildReferralPayoutReceiptDocument({
      kind: "referral_invitee_bonus",
      order: {
        id: "ref-order-1",
        amountUsdt: 5,
        date: new Date("2026-06-01T12:00:00.000Z"),
        investmentId: null,
        referralInviteId: "invite-1",
      },
      txId: "ref-tx-123",
    });

    assert.match(document.description, /Referral welcome bonus/);
    assert.match(document.amount, /^\+5\.00 USDT$/);
  });

  it("builds referral inviter bonus receipt", () => {
    const document = buildReferralPayoutReceiptDocument({
      kind: "referral_inviter_bonus",
      order: {
        id: "ref-order-2",
        amountUsdt: 10,
        date: new Date("2026-06-01T12:00:00.000Z"),
        investmentId: null,
        referralInviteId: "invite-2",
      },
      txId: "ref-tx-456",
    });

    assert.match(document.description, /Referral reward/);
  });

  it("builds principal recovery receipt", () => {
    const document = buildReferralPayoutReceiptDocument({
      kind: "principal_recovery",
      order: {
        id: "ref-order-3",
        amountUsdt: 25,
        date: new Date("2026-06-01T12:00:00.000Z"),
        investmentId: "inv-recover",
        referralInviteId: "invite-3",
      },
      txId: "ref-tx-789",
    });

    assert.match(document.description, /Principal recovery/);
    const detailLines = document.sections[1]?.lines ?? [];
    assert.ok(detailLines.some((line) => line.label === "Investment ID"));
  });

  it("builds withdrawal receipt with destination", () => {
    const document = buildWithdrawalReceiptDocument({
      order: {
        id: "wd-order-1",
        amountUsdt: 50,
        date: new Date("2026-06-01T12:00:00.000Z"),
        destinationAddress: "TXyz123withdraw",
      },
      txId: "wd-tx-abc",
    });

    assert.equal(document.heading, "Withdrawal receipt");
    assert.match(document.amount, /^-50\.00 USDT$/);
    const detailLines = document.sections[1]?.lines ?? [];
    assert.ok(
      detailLines.some(
        (line) =>
          line.label === "Destination" && line.value === "TXyz123withdraw"
      )
    );
  });

  it("routes buildUserPaymentReceiptDocument by kind", () => {
    const document = buildUserPaymentReceiptDocument({
      kind: "withdrawal",
      order: {
        id: "wd-order-2",
        amountUsdt: 12,
        date: new Date("2026-06-01T12:00:00.000Z"),
        destinationAddress: "TDest",
      },
      txId: "wd-tx-2",
    });

    assert.equal(document.heading, "Withdrawal receipt");
  });

  it("generates payout receipt filename from tx id", () => {
    assert.equal(
      userPaymentReceiptFilename("abcdefghijklmnop"),
      "indiefundr-payout-abcdefghijkl.pdf"
    );
  });

  it("generates a non-empty PDF buffer for investment payout receipt", () => {
    const document = buildInvestmentPayoutReceiptDocument({
      investment: {
        id: "inv-1",
        fundId: "balanced-growth",
        amountUsdt: 25,
        returnPercent90d: 15,
        projectedPayoutUsdt: 28.75,
        subscribedAt: new Date("2026-01-01T12:00:00.000Z"),
        maturesAt: new Date("2026-04-01T12:00:00.000Z"),
        redeemedAt: new Date("2026-03-15T12:00:00.000Z"),
        date: new Date("2026-01-01T12:00:00.000Z"),
      } as never,
      fund,
      txId: "payout-tx-abc123",
    });

    const buffer = buildReceiptPdfBuffer(document);
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  });
});
