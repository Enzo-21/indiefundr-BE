import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyWithdrawalCategoryOverride } from "@/services/admin/treasuryTxClassification";
import {
  buildChainSummary,
  buildTrxAlert,
  classifyTreasuryRow,
  classifyTreasuryTransfer,
  categoryLabel,
  syncOnChainAppWithdrawals,
  type TreasuryChainTransaction,
} from "./treasuryOnChain";

const TREASURY = "TTreasuryWallet111";
const USER_WALLET = "TUserWalletAddress123";
const EXTERNAL = "TExternalWallet999";

const userWalletAddresses = new Set([USER_WALLET]);

function makeCtx(overrides?: {
  orderTxIds?: string[];
  redemptionTxIds?: string[];
  recordedWithdrawals?: string[];
  appWithdrawalTxIds?: string[];
}) {
  const orderByTxId = new Map<string, { userEmail: string | null; detail: string }>();
  for (const id of overrides?.orderTxIds ?? []) {
    orderByTxId.set(id, { userEmail: "user@example.com", detail: "Subscribe" });
  }

  const redemptionByTxId = new Map<
    string,
    { userEmail: string | null; detail: string }
  >();
  for (const id of overrides?.redemptionTxIds ?? []) {
    redemptionByTxId.set(id, {
      userEmail: "user@example.com",
      detail: "Redemption",
    });
  }

  return {
    treasuryAddress: TREASURY,
    userWalletAddresses,
    walletByAddress: new Map([
      [USER_WALLET, { userId: "u1", email: "user@example.com" }],
    ]),
    orderByTxId,
    redemptionByTxId,
    appWithdrawalByTxId: new Set(
      overrides?.appWithdrawalTxIds ?? overrides?.recordedWithdrawals ?? []
    ),
    recordedWithdrawalTxIds: new Set(overrides?.recordedWithdrawals ?? []),
    categoryOverrideByTxId: new Map(),
    inflowTreatmentByTxId: new Map(),
  };
}

function makeChainTx(
  overrides: Partial<TreasuryChainTransaction> & Pick<TreasuryChainTransaction, "txId">
): TreasuryChainTransaction {
  return {
    type: "out",
    category: "app_withdrawal",
    classificationSource: "external",
    amount: 10,
    status: "confirmed",
    date: new Date(),
    counterparty: EXTERNAL,
    userEmail: null,
    detail: "App withdrawal",
    tronscanUrl: "https://example.com",
    ledgerRecorded: false,
    adminCategoryOverride: null,
    inflowTreatment: "none",
    inflowActionsEligible: false,
    ...overrides,
  };
}

describe("withdrawal category override", () => {
  it("override wins over heuristic classification", () => {
    const overrides = new Map([
      ["out-1", "treasury_outflow_untracked" as const],
    ]);
    const heuristic = classifyTreasuryRow(
      {
        txId: "out-1",
        type: "out",
        from: TREASURY,
        to: EXTERNAL,
      },
      {
        ...makeCtx({ appWithdrawalTxIds: ["out-1"] }),
        categoryOverrideByTxId: overrides,
      }
    );
    assert.ok(heuristic);
    const applied = applyWithdrawalCategoryOverride(
      "out-1",
      heuristic,
      overrides
    );
    assert.deepEqual(applied, {
      category: "treasury_outflow_untracked",
      source: "external",
    });
  });
});

describe("classifyTreasuryRow", () => {
  it("returns user_payment when txId matches purchase order", () => {
    const result = classifyTreasuryRow(
      {
        txId: "order-tx-1",
        type: "in",
        from: USER_WALLET,
        to: TREASURY,
      },
      makeCtx({ orderTxIds: ["order-tx-1"] })
    );
    assert.deepEqual(result, { category: "user_payment", source: "app_tx" });
  });

  it("returns user_payout when txId matches redemption", () => {
    const result = classifyTreasuryRow(
      {
        txId: "redeem-tx-1",
        type: "out",
        from: TREASURY,
        to: USER_WALLET,
      },
      makeCtx({ redemptionTxIds: ["redeem-tx-1"] })
    );
    assert.deepEqual(result, { category: "user_payout", source: "app_tx" });
  });

  it("returns wallet_match_unconfirmed for known wallet without app tx", () => {
    const inbound = classifyTreasuryRow(
      { txId: "x", type: "in", from: USER_WALLET, to: TREASURY },
      makeCtx()
    );
    assert.deepEqual(inbound, {
      category: "wallet_match_unconfirmed",
      source: "address_only",
    });

    const outbound = classifyTreasuryRow(
      { txId: "y", type: "out", from: TREASURY, to: USER_WALLET },
      makeCtx()
    );
    assert.deepEqual(outbound, {
      category: "wallet_match_unconfirmed",
      source: "address_only",
    });
  });

  it("returns external_in and untracked outflow for unknown counterparties", () => {
    assert.deepEqual(
      classifyTreasuryRow(
        { txId: "ext-in", type: "in", from: EXTERNAL, to: TREASURY },
        makeCtx()
      ),
      { category: "external_in", source: "external" }
    );
    assert.deepEqual(
      classifyTreasuryRow(
        { txId: "ext-out", type: "out", from: TREASURY, to: EXTERNAL },
        makeCtx()
      ),
      { category: "treasury_outflow_untracked", source: "external" }
    );
  });

  it("returns app_withdrawal with app_tx when tx matches AppRevenueWithdrawal", () => {
    assert.deepEqual(
      classifyTreasuryRow(
        { txId: "wd-tx-1", type: "out", from: TREASURY, to: EXTERNAL },
        makeCtx({ appWithdrawalTxIds: ["wd-tx-1"] })
      ),
      { category: "app_withdrawal", source: "app_tx" }
    );
  });

  it("filters self-transfers", () => {
    assert.equal(
      classifyTreasuryRow(
        { txId: "self", type: "in", from: TREASURY, to: TREASURY },
        makeCtx()
      ),
      null
    );
    assert.equal(
      classifyTreasuryRow(
        { txId: "loop", type: "out", from: USER_WALLET, to: USER_WALLET },
        makeCtx()
      ),
      null
    );
  });
});

describe("classifyTreasuryTransfer (address-only heuristic)", () => {
  it("marks known wallet without app tx as wallet_match_unconfirmed", () => {
    assert.equal(
      classifyTreasuryTransfer(
        { type: "in", from: USER_WALLET, to: TREASURY },
        userWalletAddresses
      ),
      "wallet_match_unconfirmed"
    );
  });

  it("classifies unknown inflow as external_in", () => {
    assert.equal(
      classifyTreasuryTransfer(
        { type: "in", from: EXTERNAL, to: TREASURY },
        userWalletAddresses
      ),
      "external_in"
    );
  });
});

describe("categoryLabel", () => {
  it("returns human labels", () => {
    assert.equal(categoryLabel("user_payment"), "User payment");
    assert.equal(categoryLabel("wallet_match_unconfirmed"), "Wallet match only");
  });
});

describe("buildChainSummary", () => {
  it("aggregates per category and counts unrecorded withdrawals", () => {
    const summary = buildChainSummary([
      {
        txId: "a",
        type: "out",
        category: "app_withdrawal",
        classificationSource: "app_tx",
        amount: 5,
        status: "confirmed",
        date: new Date(),
        counterparty: EXTERNAL,
        userEmail: null,
        detail: null,
        tronscanUrl: "https://example.com",
        ledgerRecorded: false,
      },
      {
        txId: "b",
        type: "out",
        category: "app_withdrawal",
        classificationSource: "app_tx",
        amount: 3,
        status: "confirmed",
        date: new Date(),
        counterparty: EXTERNAL,
        userEmail: null,
        detail: null,
        tronscanUrl: "https://example.com",
        ledgerRecorded: true,
      },
      {
        txId: "u",
        type: "out",
        category: "treasury_outflow_untracked",
        classificationSource: "external",
        amount: 100,
        status: "confirmed",
        date: new Date(),
        counterparty: EXTERNAL,
        userEmail: null,
        detail: null,
        tronscanUrl: "https://example.com",
        ledgerRecorded: false,
      },
      {
        txId: "c",
        type: "in",
        category: "external_in",
        classificationSource: "external",
        amount: 10,
        status: "confirmed",
        date: new Date(),
        counterparty: EXTERNAL,
        userEmail: null,
        detail: null,
        tronscanUrl: "https://example.com",
        ledgerRecorded: false,
      },
    ]);

    assert.equal(summary.byCategory.app_withdrawal.count, 2);
    assert.equal(summary.byCategory.app_withdrawal.totalUsdt, 8);
    assert.equal(summary.byCategory.treasury_outflow_untracked.count, 1);
    assert.equal(summary.byCategory.external_in.count, 1);
    assert.equal(summary.unrecordedWithdrawalCount, 1);
  });
});

describe("syncOnChainAppWithdrawals", () => {
  const readLedgerWithLiquidity = async () => ({
    poolAvailable: 100,
    treasurySurplus: 0,
  });

  it("records new confirmed app withdrawals and skips existing txRefs", async () => {
    const ctx = makeCtx({
      recordedWithdrawals: ["already-recorded"],
      appWithdrawalTxIds: ["already-recorded", "new-tx-1", "new-tx-2"],
    });
    const txs = [
      makeChainTx({
        txId: "already-recorded",
        classificationSource: "app_tx",
        ledgerRecorded: true,
      }),
      makeChainTx({
        txId: "new-tx-1",
        amount: 15,
        classificationSource: "app_tx",
      }),
      makeChainTx({
        txId: "new-tx-2",
        amount: 20,
        classificationSource: "app_tx",
      }),
    ];

    const recorded: Array<{ amountUsdt: number; txRef?: string }> = [];
    const result = await syncOnChainAppWithdrawals(
      txs,
      ctx,
      async (input) => {
        recorded.push({ amountUsdt: input.amountUsdt, txRef: input.txRef });
        return { withdrawal: {} as never, ledger: {} as never };
      },
      readLedgerWithLiquidity
    );

    assert.equal(result.recorded, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(recorded.length, 2);
    assert.equal(txs[1]?.ledgerRecorded, true);
  });

  it("continues after per-tx failure", async () => {
    const ctx = makeCtx({ appWithdrawalTxIds: ["fail-tx", "ok-tx"] });
    const txs = [
      makeChainTx({ txId: "fail-tx", classificationSource: "app_tx" }),
      makeChainTx({ txId: "ok-tx", classificationSource: "app_tx" }),
    ];

    const result = await syncOnChainAppWithdrawals(
      txs,
      ctx,
      async (input) => {
        if (input.txRef === "fail-tx") {
          throw new Error("Insufficient protected revenue");
        }
        return { withdrawal: {} as never, ledger: {} as never };
      },
      readLedgerWithLiquidity
    );

    assert.equal(result.recorded, 1);
    assert.equal(result.failed.length, 1);
    assert.equal(txs[0]?.ledgerRecorded, false);
    assert.equal(txs[1]?.ledgerRecorded, true);
  });

  it("skips sync when stored ledger has no withdrawable pool liquidity", async () => {
    const ctx = makeCtx();
    const txs = [makeChainTx({ txId: "x" })];

    let called = false;
    const result = await syncOnChainAppWithdrawals(
      txs,
      ctx,
      async () => {
        called = true;
        return { withdrawal: {} as never, ledger: {} as never };
      },
      async () => ({ poolAvailable: 10, treasurySurplus: 10 })
    );

    assert.equal(called, false);
    assert.equal(result.recorded, 0);
  });

  it("does not sync untracked external outflows", async () => {
    const ctx = makeCtx();
    const txs = [
      makeChainTx({
        txId: "historical-out",
        category: "treasury_outflow_untracked",
        classificationSource: "external",
      }),
      makeChainTx({
        txId: "unlinked-out",
        classificationSource: "external",
      }),
    ];

    let called = false;
    const result = await syncOnChainAppWithdrawals(
      txs,
      ctx,
      async () => {
        called = true;
        return { withdrawal: {} as never, ledger: {} as never };
      },
      readLedgerWithLiquidity
    );

    assert.equal(called, false);
    assert.equal(result.recorded, 0);
    assert.equal(result.failed.length, 0);
  });

  it("ignores non-confirmed and non-withdrawal rows", async () => {
    const ctx = makeCtx();
    const txs = [
      makeChainTx({ txId: "pending-tx", status: "pending" }),
      makeChainTx({
        txId: "external-in",
        type: "in",
        category: "external_in",
      }),
    ];

    let called = false;
    const result = await syncOnChainAppWithdrawals(
      txs,
      ctx,
      async () => {
        called = true;
        return { withdrawal: {} as never, ledger: {} as never };
      },
      readLedgerWithLiquidity
    );

    assert.equal(called, false);
    assert.equal(result.recorded, 0);
  });

  it("external_in chain rows expose inflow treatment fields", () => {
    const tx = makeChainTx({
      txId: "external-in",
      type: "in",
      category: "external_in",
      classificationSource: "external",
      inflowTreatment: "withdrawable",
      inflowActionsEligible: true,
    });

    assert.equal(tx.inflowActionsEligible, true);
    assert.equal(tx.inflowTreatment, "withdrawable");
  });
});

describe("buildTrxAlert", () => {
  it("returns null when TRX is above threshold", () => {
    const original = process.env.TREASURY_MIN_TRX_BALANCE;
    process.env.TREASURY_MIN_TRX_BALANCE = "50";
    try {
      assert.equal(buildTrxAlert(100), null);
    } finally {
      if (original === undefined) {
        delete process.env.TREASURY_MIN_TRX_BALANCE;
      } else {
        process.env.TREASURY_MIN_TRX_BALANCE = original;
      }
    }
  });
});
