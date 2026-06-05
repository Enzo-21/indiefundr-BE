import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("walletBalance withdrawal reservations", () => {
  it("sums multiple open withdrawals and subtracts from on-chain USDT", async () => {
    mock.module("@/lib/prisma", {
      namedExports: {
        prisma: {
          purchaseOrder: {
            findMany: async () => [{ reservedUsdt: 50 }],
            count: async () => 1,
          },
          withdrawalOrder: {
            findMany: async () => [
              { reservedUsdt: 80 },
              { reservedUsdt: 10 },
            ],
            count: async () => 2,
          },
        },
      },
    });
    mock.module("@/services/tron/client", {
      namedExports: {
        getUsdtBalance: async () => 90,
        getPendingIncomingUsdtTotal: async () => 0,
        subtractPendingInboundUsdt: (onChain: number) => onChain,
      },
    });

    const {
      getReservedUsdtForWithdrawals,
      getReservedUsdtForWallet,
      getWalletUsdtAvailability,
    } = await import("./walletBalance");

    assert.equal(await getReservedUsdtForWithdrawals("wallet-1"), 90);
    assert.equal(await getReservedUsdtForWallet("wallet-1"), 140);
    const availability = await getWalletUsdtAvailability({
      id: "wallet-1",
      address: "TArjbXnrL5qTZo6YrT1GzbKHYa3bJSj6Yr",
    });
    assert.equal(availability.onChainUsdt, 90);
    assert.equal(availability.reservedUsdt, 140);
    assert.equal(availability.availableUsdt, 0);
    assert.equal(availability.pendingWithdrawalsCount, 2);
  });
});
