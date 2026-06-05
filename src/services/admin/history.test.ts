import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TreasuryEventType } from "@prisma/client";
import {
  adminOnChainTransactionToHistoryRow,
  buildAdminHistoryRows,
  treasuryEventToHistoryRow,
} from "./history";
import { historyRowsToCsv } from "@/app/admin/(protected)/history/historyCsv";

function makeEvent(overrides: {
  id: string;
  type: TreasuryEventType;
  amountUsdt: number;
  createdAt: Date;
  meta?: Record<string, unknown> | null;
}) {
  return {
    investmentId: null,
    purchaseOrderId: null,
    withdrawalId: null,
    poolAfter: null,
    surplusAfter: null,
    protectedCreditedAfter: null,
    protectedWithdrawnAfter: null,
    meta: null,
    ...overrides,
  };
}

function makeAuditTx(overrides: {
  id: string;
  txId: string;
  chainDate: Date;
  category?: string;
  direction?: string;
  amountUsdt?: number;
  status?: string;
  fromUserEmail?: string | null;
  toUserEmail?: string | null;
  fromAddress?: string;
  toAddress?: string;
  detail?: string | null;
  tronscanUrl?: string | null;
  poolInflowRecordedAt?: Date | null;
  adminSurplusMarkedAt?: Date | null;
}) {
  return {
    category: "investment_payment",
    direction: "in",
    amountUsdt: 25,
    status: "confirmed",
    fromUserEmail: "user@example.com",
    toUserEmail: null,
    fromAddress: "TUserWallet",
    toAddress: "TTreasury",
    detail: "Subscribe (Balanced)",
    tronscanUrl: "https://example.com/tx",
    poolInflowRecordedAt: null,
    adminSurplusMarkedAt: null,
    ...overrides,
  };
}

describe("admin transaction history", () => {
  it("maps treasury events to ledger history rows", () => {
    const row = treasuryEventToHistoryRow(
      makeEvent({
        id: "event-1",
        type: TreasuryEventType.payout_outflow,
        amountUsdt: 35,
        createdAt: new Date("2026-05-01T12:00:00.000Z"),
      })
    );

    assert.equal(row.id, "ledger-event-1");
    assert.equal(row.source, "ledger");
    assert.equal(row.label, "User payout");
    assert.equal(row.status, "recorded");
    assert.equal(row.direction, "out");
    assert.equal(row.amountUsdt, 35);
    assert.deepEqual(row.payoutUnlockers, []);
  });

  it("adds payout unlocker details from payout event metadata", () => {
    const row = treasuryEventToHistoryRow(
      makeEvent({
        id: "payout-event",
        type: TreasuryEventType.payout_outflow,
        amountUsdt: 35,
        createdAt: new Date("2026-05-01T12:00:00.000Z"),
        meta: {
          reason: "User B and User C invested after this user.",
          unlockingUserIds: ["user-b", "user-c"],
        },
      }),
      new Map([
        ["user-b", { name: "User B", email: "b@example.com" }],
        ["user-c", { name: "User C", email: "c@example.com" }],
      ])
    );

    assert.deepEqual(row.payoutUnlockers, [
      { userId: "user-b", name: "User B", email: "b@example.com" },
      { userId: "user-c", name: "User C", email: "c@example.com" },
    ]);
  });

  it("maps persisted on-chain transactions to history rows", () => {
    const row = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-1",
        txId: "tx-1",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "user_payout",
        direction: "out",
        amountUsdt: 35,
        fromUserEmail: null,
        toUserEmail: "user@example.com",
        fromAddress: "TTreasury",
        toAddress: "TUserWallet",
      })
    );

    assert.equal(row.id, "chain-audit-1");
    assert.equal(row.source, "treasury_chain");
    assert.equal(row.label, "User payout");
    assert.equal(row.status, "confirmed");
    assert.equal(row.direction, "out");
    assert.equal(row.userEmail, "user@example.com");
    assert.equal(row.fromAddress, "TTreasury");
    assert.equal(row.toAddress, "TUserWallet");
    assert.equal(row.tronscanUrl, "https://example.com/tx");
    assert.deepEqual(row.payoutUnlockers, []);
  });

  it("flags external treasury deposits for inflow classification actions", () => {
    const unclassified = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-ext-new",
        txId: "tx-ext-new",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "treasury_external_deposit",
        direction: "in",
        status: "confirmed",
        fromUserEmail: null,
        toUserEmail: null,
      })
    );

    assert.equal(unclassified.inflowActionsEligible, true);
    assert.equal(unclassified.inflowTreatment, "none");

    const withdrawable = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-ext",
        txId: "tx-ext",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "treasury_external_deposit",
        direction: "in",
        status: "confirmed",
        fromUserEmail: null,
        toUserEmail: null,
        poolInflowRecordedAt: new Date("2026-05-02T12:05:00.000Z"),
      })
    );

    assert.equal(withdrawable.inflowActionsEligible, true);
    assert.equal(withdrawable.inflowTreatment, "withdrawable");

    const surplus = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-ext-surplus",
        txId: "tx-ext-surplus",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "treasury_external_deposit",
        direction: "in",
        status: "confirmed",
        fromUserEmail: null,
        toUserEmail: null,
        poolInflowRecordedAt: new Date("2026-05-02T12:05:00.000Z"),
        adminSurplusMarkedAt: new Date("2026-05-02T12:10:00.000Z"),
      })
    );

    assert.equal(surplus.inflowTreatment, "surplus");
  });

  it("maps user wallet audit rows to wallet chain source", () => {
    const row = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-wallet",
        txId: "tx-wallet",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "user_wallet_deposit",
        direction: "in",
        fromUserEmail: null,
        toUserEmail: "user@example.com",
      })
    );

    assert.equal(row.source, "wallet_chain");
    assert.equal(row.label, "User wallet deposit");
    assert.equal(row.userEmail, "user@example.com");
  });

  it("merges ledger and chain rows newest first", () => {
    const rows = buildAdminHistoryRows({
      events: [
        makeEvent({
          id: "older-ledger",
          type: TreasuryEventType.subscribe_inflow,
          amountUsdt: 25,
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
        }),
        makeEvent({
          id: "newest-ledger",
          type: TreasuryEventType.surplus_credit,
          amountUsdt: 10,
          createdAt: new Date("2026-05-03T10:00:00.000Z"),
        }),
      ],
      auditTransactions: [
        makeAuditTx({
          id: "middle-chain",
          txId: "middle-chain",
          chainDate: new Date("2026-05-02T10:00:00.000Z"),
        }),
      ],
      limit: 10,
    });

    assert.deepEqual(
      rows.map((row) => row.id),
      ["ledger-newest-ledger", "chain-middle-chain", "ledger-older-ledger"]
    );
  });

  it("applies the requested history limit after sorting", () => {
    const rows = buildAdminHistoryRows({
      events: [
        makeEvent({
          id: "old",
          type: TreasuryEventType.subscribe_inflow,
          amountUsdt: 25,
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
        }),
        makeEvent({
          id: "new",
          type: TreasuryEventType.payout_outflow,
          amountUsdt: 35,
          createdAt: new Date("2026-05-02T10:00:00.000Z"),
        }),
      ],
      auditTransactions: [],
      limit: 1,
    });

    assert.deepEqual(
      rows.map((row) => row.id),
      ["ledger-new"]
    );
  });

  it("exports rich on-chain audit fields to CSV", () => {
    const row = adminOnChainTransactionToHistoryRow(
      makeAuditTx({
        id: "audit-csv",
        txId: "tx-csv",
        chainDate: new Date("2026-05-02T12:00:00.000Z"),
        category: "user_to_user_transfer",
        direction: "transfer",
        fromUserEmail: "a@example.com",
        toUserEmail: "b@example.com",
        fromAddress: "TWALLET_A",
        toAddress: "TWALLET_B",
      })
    );

    const csv = historyRowsToCsv([row]);

    assert.match(
      csv.split("\n")[0],
      /fromUserEmail,toUserEmail,fromAddress,toAddress/
    );
    assert.match(csv, /a@example.com -> b@example.com/);
    assert.match(csv, /TWALLET_A,TWALLET_B/);
  });
});
