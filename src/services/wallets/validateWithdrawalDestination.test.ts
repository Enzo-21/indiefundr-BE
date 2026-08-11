import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WithdrawalDestinationDeps } from "./withdrawalDestination";
import { validateWithdrawalDestination } from "./withdrawalDestination";

const userId = "user-1";
const mainAddress = "TMainWalletAddress123456789012345";
const destAddress = "TDestWalletAddress1234567890123456";

function mockDeps(
  overrides: Partial<WithdrawalDestinationDeps> = {}
): WithdrawalDestinationDeps {
  return {
    normalizeTronAddress: async (address) => address.trim(),
    validateAddress: async () => true,
    isAccountActivatedOnChain: async () => true,
    getMainWallet: async () =>
      ({ id: "w1", address: mainAddress }) as NonNullable<
        Awaited<ReturnType<WithdrawalDestinationDeps["getMainWallet"]>>
      >,
    findWalletByAddress: async () => null,
    activateWalletFromTreasury: async () => ({ status: "already_active" }),
    waitForActivation: async () => true,
    ...overrides,
  };
}

describe("validateWithdrawalDestination", () => {
  it("rejects empty address", async () => {
    const result = await validateWithdrawalDestination(userId, "   ", mockDeps());
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.message, /required/i);
    }
  });

  it("rejects invalid Tron format", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      "bad",
      mockDeps({
        normalizeTronAddress: async () => "bad",
        validateAddress: async () => false,
      })
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.message, "Enter a valid Tron (TRC20) address");
    }
  });

  it("rejects external unactivated address with clear message", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr.trim(),
        isAccountActivatedOnChain: async () => false,
        findWalletByAddress: async () => null,
      })
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.message, /not activated on the Tron network/i);
      assert.doesNotMatch(result.message, /could not be found on the network/i);
    }
  });

  it("activates app wallet destination then allows withdrawal", async () => {
    let activatedCalls = 0;
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr.trim(),
        isAccountActivatedOnChain: async () => {
          activatedCalls += 1;
          // First check fails; after activate it succeeds
          return activatedCalls > 1;
        },
        findWalletByAddress: async () => ({
          id: "dest-w1",
          userId: "user-2",
          address: destAddress,
          activatedAt: null,
          activationTxId: null,
        }),
        activateWalletFromTreasury: async () => ({
          status: "activated",
          txId: "act-tx-1",
        }),
      })
    );
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.normalizedAddress, destAddress);
    }
  });

  it("waits for pending app wallet activation then allows", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr.trim(),
        isAccountActivatedOnChain: async () => false,
        findWalletByAddress: async () => ({
          id: "dest-w1",
          userId: "user-2",
          address: destAddress,
          activatedAt: null,
          activationTxId: "pending-tx",
        }),
        activateWalletFromTreasury: async () => ({
          status: "pending",
          txId: "pending-tx",
        }),
        waitForActivation: async () => true,
      })
    );
    assert.equal(result.valid, true);
  });

  it("rejects when app wallet activation fails", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr.trim(),
        isAccountActivatedOnChain: async () => false,
        findWalletByAddress: async () => ({
          id: "dest-w1",
          userId: "user-2",
          address: destAddress,
          activatedAt: null,
          activationTxId: null,
        }),
        activateWalletFromTreasury: async () => ({
          status: "failed",
          error: "Treasury not configured",
        }),
        waitForActivation: async () => false,
      })
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.message, /IndieFundr wallet is not activated/i);
    }
  });

  it("rejects own wallet address", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      mainAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr,
      })
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.message, /own wallet/i);
    }
  });

  it("accepts valid activated destination", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async (addr) => addr.trim(),
      })
    );
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.normalizedAddress, destAddress);
    }
  });
});
