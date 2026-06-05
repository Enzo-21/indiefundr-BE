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

  it("rejects address not found on network", async () => {
    const result = await validateWithdrawalDestination(
      userId,
      destAddress,
      mockDeps({
        normalizeTronAddress: async () => destAddress,
        isAccountActivatedOnChain: async () => false,
      })
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.message, /could not be found on the network/i);
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
