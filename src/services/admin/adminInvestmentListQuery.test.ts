import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvestmentStatus } from "@prisma/client";
import {
  buildAdminInvestmentsPageInfo,
  buildAdminInvestmentsWhere,
  clampAdminInvestmentsLimit,
  resolveAdminInvestmentsView,
  sliceAdminInvestmentsPage,
} from "@/services/admin/adminInvestmentListQuery";

describe("adminInvestmentListQuery", () => {
  it("defaults to queue view with bounded limit", () => {
    assert.equal(resolveAdminInvestmentsView({}), "queue");
    assert.equal(clampAdminInvestmentsLimit(500), 200);
    assert.equal(clampAdminInvestmentsLimit(0), 1);
  });

  it("builds archive ordering and paid-status filter", () => {
    const { view, where, orderBy } = buildAdminInvestmentsWhere({
      view: "archive",
      limit: 50,
    });

    assert.equal(view, "archive");
    assert.deepEqual(orderBy, [
      { redeemedAt: "desc" },
      { subscribedAt: "desc" },
      { id: "desc" },
    ]);
    assert.deepEqual(where, {
      AND: [
        {
          status: {
            in: [
              InvestmentStatus.redeemed,
              InvestmentStatus.referral_recovered,
              InvestmentStatus.failed,
            ],
          },
        },
      ],
    });
  });

  it("detects hasMore and slices page rows", () => {
    const rows = [
      {
        id: "b",
        subscribedAt: new Date("2024-02-01T00:00:00.000Z"),
        redeemedAt: null,
      },
      {
        id: "c",
        subscribedAt: new Date("2024-03-01T00:00:00.000Z"),
        redeemedAt: null,
      },
      {
        id: "d",
        subscribedAt: new Date("2024-04-01T00:00:00.000Z"),
        redeemedAt: null,
      },
    ];

    const pageInfo = buildAdminInvestmentsPageInfo({
      view: "queue",
      limit: 2,
      rows,
    });

    assert.equal(pageInfo.hasMore, true);
    assert.equal(sliceAdminInvestmentsPage(rows, 2).length, 2);
    assert.ok(pageInfo.nextCursor);
  });
});
