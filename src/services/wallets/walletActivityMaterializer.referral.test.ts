import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("buildMaterializedActivityRows referral payout dedupe", () => {
  it("skips usdt_transfer rows for completed referral payout tx ids", async () => {
    mock.module("@/lib/env", {
      namedExports: {
        getEnv: () => ({}),
      },
    });
    mock.module("@/lib/config/investmentFunds", {
      namedExports: {
        getFundById: () => ({ name: "Growth" }),
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        getTxId: () => null,
      },
    });
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getTronscanTxUrl: (txId: string) => `https://tronscan.test/${txId}`,
        buildWalletActivityWhere: () => ({}),
        buildFailedInvestmentActivityWhere: () => ({}),
        buildPurchaseOrderActivityWhere: () => ({}),
      },
    });
    mock.module("@/services/orders/withdrawalOrderSettlementView", {
      namedExports: {
        buildWithdrawalOrderSettlementView: () => ({}),
      },
    });
    mock.module("@/services/orders/orderSettlementView", {
      namedExports: {
        deriveOrderSettlementPhaseFromDb: () => null,
      },
    });

    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          investment: {
            findMany: async () => [],
          },
          purchaseOrder: {
            findMany: async () => [],
          },
          withdrawalOrder: {
            findMany: async () => [],
          },
          referralPayoutOrder: {
            findMany: async () => [{ usdtTxId: "referral-payout-tx" }],
          },
          failedInvestment: {
            findMany: async () => [],
          },
          walletChainTransfer: {
            findMany: async () => [
              {
                id: "transfer-1",
                txId: "referral-payout-tx",
                type: "in",
                amountUsdt: 2,
                status: "confirmed",
                statusFinal: true,
                chainDate: new Date("2026-01-02T00:00:00.000Z"),
              },
              {
                id: "transfer-2",
                txId: "other-tx",
                type: "in",
                amountUsdt: 5,
                status: "confirmed",
                statusFinal: true,
                chainDate: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          },
        },
      },
    });

    const { buildMaterializedActivityRows } = await import(
      "./walletActivityMaterializer"
    );

    const rows = await buildMaterializedActivityRows("user-1", "wallet-1");
    const chainRows = rows.filter((row) => row.kind === "usdt_transfer");
    assert.equal(chainRows.length, 1);
    assert.equal(chainRows[0]?.txId, "other-tx");
  });
});
