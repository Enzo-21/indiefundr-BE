import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditRowUpdateData,
  auditRowWriteData,
  buildAdminOnChainIdentityKey,
  classifyAdminOnChainTransfer,
  getUserSyncAddresses,
  syncUserOnChainHistorySafely,
  type AdminHistorySyncContext,
  upsertAdminOnChainTransfersSafely,
} from "./historySync";

function makeCtx(
  overrides: Partial<AdminHistorySyncContext> = {}
): AdminHistorySyncContext {
  return {
    treasuryAddress: "TTREASURY",
    walletByAddress: new Map([
      [
        "TWALLET_A",
        {
          walletId: "wallet-a",
          userId: "user-a",
          email: "a@example.com",
        },
      ],
      [
        "TWALLET_B",
        {
          walletId: "wallet-b",
          userId: "user-b",
          email: "b@example.com",
        },
      ],
      [
        "TWALLET_C",
        {
          walletId: "wallet-c",
          userId: "user-a",
          email: "a@example.com",
        },
      ],
    ]),
    orderByTxId: new Map([
      ["tx-invest", { userEmail: "a@example.com", detail: "Subscribe" }],
    ]),
    redemptionByTxId: new Map([
      ["tx-redeem", { userEmail: "a@example.com", detail: "Redemption" }],
    ]),
    appWithdrawalByTxId: new Map([
      ["tx-admin-withdraw", { note: "Monthly protected revenue withdrawal" }],
    ]),
    categoryOverrideByTxId: new Map(),
    ...overrides,
  };
}

function makeTransfer(overrides: {
  txId: string;
  type?: "in" | "out";
  from: string;
  to: string;
}) {
  return {
    type: "in" as const,
    amount: 25,
    date: new Date("2026-05-01T12:00:00.000Z"),
    status: "confirmed" as const,
    ...overrides,
  };
}

describe("admin history on-chain sync classification", () => {
  const ctx = makeCtx();

  it("classifies external funding into a user wallet", () => {
    const classified = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-deposit",
        from: "TEXTERNAL",
        to: "TWALLET_A",
      }),
      ctx
    );

    assert.equal(classified?.category, "user_wallet_deposit");
    assert.equal(classified?.direction, "in");
    assert.equal(classified?.toUserEmail, "a@example.com");
  });

  it("classifies user withdrawals to external wallets", () => {
    const classified = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-withdraw",
        type: "out",
        from: "TWALLET_A",
        to: "TEXTERNAL",
      }),
      ctx
    );

    assert.equal(classified?.category, "user_wallet_withdrawal");
    assert.equal(classified?.direction, "out");
    assert.equal(classified?.fromUserEmail, "a@example.com");
  });

  it("classifies app user-to-user transfers once with both users", () => {
    const classified = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-p2p",
        type: "out",
        from: "TWALLET_A",
        to: "TWALLET_B",
      }),
      ctx
    );

    assert.equal(classified?.category, "user_to_user_transfer");
    assert.equal(classified?.direction, "transfer");
    assert.equal(classified?.fromUserEmail, "a@example.com");
    assert.equal(classified?.toUserEmail, "b@example.com");
  });

  it("uses app transaction matches for investment payments and payouts", () => {
    const investment = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-invest",
        type: "out",
        from: "TWALLET_A",
        to: "TTREASURY",
      }),
      ctx
    );
    const payout = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-redeem",
        type: "in",
        from: "TTREASURY",
        to: "TWALLET_A",
      }),
      ctx
    );

    assert.equal(investment?.category, "investment_payment");
    assert.equal(investment?.classificationSource, "app_tx");
    assert.equal(payout?.category, "user_payout");
    assert.equal(payout?.classificationSource, "app_tx");
  });

  it("builds the same identity key independent of observing wallet direction", () => {
    const outbound = makeTransfer({
      txId: "tx-p2p",
      type: "out",
      from: "TWALLET_A",
      to: "TWALLET_B",
    });
    const inbound = makeTransfer({
      txId: "tx-p2p",
      type: "in",
      from: "TWALLET_A",
      to: "TWALLET_B",
    });

    assert.equal(
      buildAdminOnChainIdentityKey(outbound),
      buildAdminOnChainIdentityKey(inbound)
    );
  });

  it("returns only the current user's wallet addresses for scoped sync", () => {
    assert.deepEqual(getUserSyncAddresses(ctx, "user-a"), [
      "TWALLET_A",
      "TWALLET_C",
    ]);
    assert.deepEqual(getUserSyncAddresses(ctx, "missing-user"), []);
  });

  it("builds idempotent create and update payloads for audit upserts", () => {
    const classified = classifyAdminOnChainTransfer(
      makeTransfer({
        txId: "tx-deposit-upsert",
        from: "TEXTERNAL",
        to: "TWALLET_A",
      }),
      ctx
    );
    assert.ok(classified);

    const create = auditRowWriteData(classified);
    const update = auditRowUpdateData(create);

    assert.equal(create.identityKey, classified.identityKey);
    assert.equal(create.txId, "tx-deposit-upsert");
    assert.equal(update.status, "confirmed");
    assert.equal(update.category, "user_wallet_deposit");
    assert.equal(
      Object.prototype.hasOwnProperty.call(update, "identityKey"),
      false
    );
  });

  it("returns null instead of throwing when safe user sync fails", async () => {
    const result = await syncUserOnChainHistorySafely("user-a", async () => {
      throw new Error("tron unavailable");
    });

    assert.equal(result, null);
  });

  it("returns null instead of throwing when safe selected-wallet upsert fails", async () => {
    const result = await upsertAdminOnChainTransfersSafely([], async () => {
      throw new Error("database unavailable");
    });

    assert.equal(result, null);
  });
});
