import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import {
  assertCanSponsor,
  computeSponsorShortfall,
} from "./feeSponsorship";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("feeSponsorship", () => {
  it("computeSponsorShortfall returns positive shortfall", () => {
    const shortfall = computeSponsorShortfall({
      estimatedTrx: 5,
      trxBalance: 2,
    });
    assert.equal(shortfall, 3);
  });

  it(
    "assertCanSponsor allows sponsorship beyond former daily caps",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Fee Sponsor Test",
          email: `fee-sponsor-${Date.now()}@example.com`,
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          name: "Test",
          address: "TTestAddressForFeeSponsorship123456789",
          privateKey: "test-private-key",
        },
      });

      await prisma.purchaseOrder.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          fundId: "growth",
          costUsdt: 25,
          reservedUsdt: 25,
          sponsoredTrx: 29,
          status: "completed",
        },
      });

      await assert.doesNotReject(() => assertCanSponsor(user.id, 2));

      await prisma.purchaseOrder.deleteMany({ where: { userId: user.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
