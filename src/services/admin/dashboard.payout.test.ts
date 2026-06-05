import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import {
  computeFifoSurplusEligibleInvestmentIds,
  getSurplusPayoutEligibilityWithFifo,
} from "@/services/revenueEngine/payoutScheduler";

function surplusBlockReasonFromEligibility(
  reason: string,
  surplusShortfallUsdt: number
): string | null {
  if (reason === "liquidity_fifo_eligible") {
    return null;
  }
  switch (reason) {
    case "insufficient_surplus":
      return `Insufficient surplus (short ${formatUsdtDisplay(surplusShortfallUsdt)} USDT)`;
    case "normal_payout_unlocked":
      return "Use Pay now (two-user unlock)";
    case "fifo_surplus_blocked":
      return "Earlier investments reserve available surplus (FIFO)";
    default:
      return "Surplus payout not available";
  }
}

function payNowBlockReason(inv: {
  status: InvestmentStatus;
  payoutUnlockedAt: Date | null;
  payoutFailureReason: string | null;
}): string | null {
  if (inv.status === InvestmentStatus.redeemed) {
    return "Already paid";
  }
  if (
    inv.status === InvestmentStatus.redeeming &&
    !inv.payoutFailureReason
  ) {
    return "Payout in progress";
  }
  if (!inv.payoutUnlockedAt) {
    return "Waiting for two-user unlock";
  }
  return null;
}

function resolveCanPayWithSurplus(
  inv: {
    id: string;
    status: InvestmentStatus;
    subscribedAt: Date | null;
    projectedPayoutUsdt: number;
    payoutUnlockedAt: Date | null;
    redemptionTransaction: unknown;
    maturesAt: Date | null;
  },
  allInvestments: typeof inv[],
  treasurySurplus: number
): boolean {
  const fifoEligibleIds = computeFifoSurplusEligibleInvestmentIds(
    allInvestments.map((row) => ({
      id: row.id,
      subscribedAt: row.subscribedAt,
      status: row.status,
      projectedPayoutUsdt: row.projectedPayoutUsdt,
      payoutUnlockedAt: row.payoutUnlockedAt,
      redemptionTransaction: row.redemptionTransaction,
      maturesAt: row.maturesAt,
    })),
    { treasurySurplus }
  );
  const payNowBlocked = payNowBlockReason(inv);
  const canPayNow = payNowBlocked == null;
  const surplusEligibility = getSurplusPayoutEligibilityWithFifo(
    {
      id: inv.id,
      subscribedAt: inv.subscribedAt,
      status: inv.status,
      projectedPayoutUsdt: inv.projectedPayoutUsdt,
      payoutUnlockedAt: inv.payoutUnlockedAt,
      redemptionTransaction: inv.redemptionTransaction,
      maturesAt: inv.maturesAt,
    },
    { treasurySurplus },
    fifoEligibleIds
  );
  return surplusEligibility.eligibleForLiquiditySurplusPay && !canPayNow;
}

describe("admin investment payout hints", () => {
  it("blocks pay now until two-user unlock", () => {
    assert.equal(
      payNowBlockReason({
        status: InvestmentStatus.active,
        payoutUnlockedAt: null,
        payoutFailureReason: null,
      }),
      "Waiting for two-user unlock"
    );
  });

  it("allows pay now when unlocked", () => {
    assert.equal(
      payNowBlockReason({
        status: InvestmentStatus.matured,
        payoutUnlockedAt: new Date(),
        payoutFailureReason: null,
      }),
      null
    );
  });

  it("surplus hint when normal unlock path applies", () => {
    assert.equal(
      surplusBlockReasonFromEligibility("normal_payout_unlocked", 0),
      "Use Pay now (two-user unlock)"
    );
  });

  it("reports fifo blocked reason", () => {
    assert.equal(
      surplusBlockReasonFromEligibility("fifo_surplus_blocked", 0),
      "Earlier investments reserve available surplus (FIFO)"
    );
  });

  it("does not offer surplus when normal pay is available", () => {
    const inv = {
      id: "inv-a",
      status: InvestmentStatus.matured,
      subscribedAt: new Date("2026-01-01"),
      projectedPayoutUsdt: 31,
      payoutUnlockedAt: new Date("2026-02-01"),
      redemptionTransaction: null,
      maturesAt: new Date("2026-04-01"),
    };
    assert.equal(
      resolveCanPayWithSurplus(inv, [inv], 100),
      false
    );
  });

  it("offers surplus only to fifo head when later rows also fit individually", () => {
    const invA = {
      id: "inv-a",
      status: InvestmentStatus.matured,
      subscribedAt: new Date("2026-01-01"),
      projectedPayoutUsdt: 31,
      payoutUnlockedAt: null,
      redemptionTransaction: null,
      maturesAt: new Date("2026-04-01"),
    };
    const invB = {
      id: "inv-b",
      status: InvestmentStatus.matured,
      subscribedAt: new Date("2026-01-02"),
      projectedPayoutUsdt: 35,
      payoutUnlockedAt: null,
      redemptionTransaction: null,
      maturesAt: new Date("2026-04-02"),
    };
    const rows = [invA, invB];
    assert.equal(resolveCanPayWithSurplus(invA, rows, 50), true);
    assert.equal(resolveCanPayWithSurplus(invB, rows, 50), false);
  });

  it("counts unlocked and surplus payout availability separately", () => {
    const rows = [
      {
        canPayNow: true,
        canPayWithSurplus: false,
        showPayoutActions: true,
      },
      {
        canPayNow: true,
        canPayWithSurplus: false,
        showPayoutActions: true,
      },
      {
        canPayNow: false,
        canPayWithSurplus: true,
        showPayoutActions: true,
      },
      {
        canPayNow: false,
        canPayWithSurplus: false,
        showPayoutActions: true,
      },
    ];
    const unlockedPayoutCount = rows.filter(
      (row) => row.canPayNow && row.showPayoutActions
    ).length;
    const surplusPayoutCount = rows.filter(
      (row) => row.canPayWithSurplus
    ).length;
    assert.equal(unlockedPayoutCount, 2);
    assert.equal(surplusPayoutCount, 1);
  });
});
