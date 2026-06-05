import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";

function countOverviewInvestmentStats(
  investments: Array<{ userId: string; status: InvestmentStatus }>
) {
  const investedUserIds = new Set<string>();
  let activeInvestments = 0;
  let maturedInvestments = 0;
  let redeemingInvestments = 0;
  let investmentsPaid = 0;

  for (const inv of investments) {
    if (inv.status === InvestmentStatus.failed) continue;
    investedUserIds.add(inv.userId);
    if (inv.status === InvestmentStatus.active) activeInvestments++;
    if (inv.status === InvestmentStatus.matured) maturedInvestments++;
    if (inv.status === InvestmentStatus.redeeming) redeemingInvestments++;
    if (inv.status === InvestmentStatus.redeemed) investmentsPaid++;
  }

  return {
    usersWithInvestment: investedUserIds.size,
    investmentsPaid,
    activeInvestments,
    maturedInvestments,
    redeemingInvestments,
  };
}

describe("admin dashboard investment counts", () => {
  it("counts redeemed investments not distinct users", () => {
    const stats = countOverviewInvestmentStats([
      { userId: "u1", status: InvestmentStatus.redeemed },
      { userId: "u1", status: InvestmentStatus.redeemed },
      { userId: "u2", status: InvestmentStatus.redeemed },
      { userId: "u3", status: InvestmentStatus.active },
    ]);

    assert.equal(stats.investmentsPaid, 3);
    assert.equal(stats.usersWithInvestment, 3);
    assert.equal(stats.activeInvestments, 1);
  });
});
