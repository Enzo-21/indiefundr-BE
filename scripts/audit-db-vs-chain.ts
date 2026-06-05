/**
 * Export MongoDB state + Shasta TRC20 history to CSV and produce comparison reports.
 * Usage: npm run audit:db-vs-chain
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { getEnv } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";
import * as tron from "../src/services/tron/client";
import { TreasuryEventType } from "@prisma/client";
import {
  buildFundPaymentContext,
  collectPaymentTxIdsFromOrder,
  resolvePaymentFromTxIds,
  inspectUsdtPaymentTx,
} from "../src/services/tron/usdtPaymentChainTruth";
import type { PurchaseOrder } from "@prisma/client";

type CsvRow = Record<
  string,
  string | number | boolean | null | undefined | Date
>;

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const str =
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.join("|")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: CsvRow[]): string {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(",")),
  ];
  return lines.join("\n");
}

function writeCsv(outDir: string, filename: string, rows: CsvRow[]): void {
  fs.writeFileSync(path.join(outDir, filename), toCsv(rows), "utf8");
}

function txIdFromJson(value: unknown): string | null {
  return tron.getTxId(
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null
  );
}

function shortAddress(address: string): string {
  const clean = address.replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(0, 8) || "unknown";
}

async function exportDatabase(outDir: string) {
  const [
    users,
    wallets,
    investments,
    purchaseOrders,
    failedInvestments,
    walletActivities,
    chainTransfers,
    treasuryEvents,
    treasuryLedger,
    adminOnChain,
    feeSponsorships,
    profiles,
    photos,
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { date: "desc" } }),
    prisma.wallet.findMany({ orderBy: { date: "desc" } }),
    prisma.investment.findMany({ orderBy: { date: "desc" } }),
    prisma.purchaseOrder.findMany({ orderBy: { date: "desc" } }),
    prisma.failedInvestment.findMany({ orderBy: { date: "desc" } }),
    prisma.walletActivity.findMany({ orderBy: { occurredAt: "desc" } }),
    prisma.walletChainTransfer.findMany({ orderBy: { chainDate: "desc" } }),
    prisma.treasuryEvent.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.treasuryLedger.findMany(),
    prisma.adminOnChainTransaction.findMany({ orderBy: { chainDate: "desc" } }),
    prisma.feeSponsorship.findMany({ orderBy: { date: "desc" } }),
    prisma.profile.findMany({ orderBy: { date: "desc" } }),
    prisma.photo.findMany(),
  ]);

  writeCsv(
    outDir,
    "db_users.csv",
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      date: u.date,
      hasVerifiedMail: u.hasVerifiedMail,
    }))
  );

  writeCsv(
    outDir,
    "db_wallets.csv",
    wallets.map((w) => ({
      id: w.id,
      userId: w.userId,
      address: w.address,
      isMainWallet: w.isMainWallet,
      isCustom: w.isCustom,
      onChainUsdtCached: w.onChainUsdtCached,
      onChainUsdtCachedAt: w.onChainUsdtCachedAt,
      pendingInboundCached: w.pendingInboundCached,
      activitySyncedAt: w.activitySyncedAt,
      activatedAt: w.activatedAt,
      activationTxId: w.activationTxId,
    }))
  );

  writeCsv(
    outDir,
    "db_investments.csv",
    investments.map((inv) => ({
      id: inv.id,
      userId: inv.userId,
      walletId: inv.walletId,
      fundId: inv.fundId,
      status: inv.status,
      amountUsdt: inv.amountUsdt,
      purchaseOrderId: inv.purchaseOrderId,
      txId: txIdFromJson(inv.transaction),
      redemptionTxId: txIdFromJson(inv.redemptionTransaction),
      date: inv.date,
      subscribedAt: inv.subscribedAt,
      maturesAt: inv.maturesAt,
    }))
  );

  writeCsv(
    outDir,
    "db_purchase_orders.csv",
    purchaseOrders.map((o) => ({
      id: o.id,
      userId: o.userId,
      walletId: o.walletId,
      fundId: o.fundId,
      status: o.status,
      step: o.step,
      costUsdt: o.costUsdt,
      usdtTxId: o.usdtTxId,
      failedUsdtTxIds: (o.failedUsdtTxIds ?? []).join("|"),
      topUpTxId: o.topUpTxId,
      investmentId: o.investmentId,
      paymentChainOutcome: o.paymentChainOutcome,
      paymentChainTxId: o.paymentChainTxId,
      paymentChainFinal: o.paymentChainFinal,
      paymentChainCheckedAt: o.paymentChainCheckedAt,
      failureReason: o.failureReason,
      date: o.date,
      updatedAt: o.updatedAt,
    }))
  );

  writeCsv(
    outDir,
    "db_failed_investments.csv",
    failedInvestments.map((f) => ({
      id: f.id,
      userId: f.userId,
      walletId: f.walletId,
      fundId: f.fundId,
      amountUsdt: f.amountUsdt,
      txId: txIdFromJson(f.transaction),
      date: f.date,
    }))
  );

  writeCsv(
    outDir,
    "db_wallet_activities.csv",
    walletActivities.map((a) => ({
      id: a.id,
      userId: a.userId,
      walletId: a.walletId,
      kind: a.kind,
      entityId: a.entityId,
      txId: a.txId,
      type: a.type,
      status: a.status,
      label: a.label,
      amountUsdt: a.amountUsdt,
      occurredAt: a.occurredAt,
      chainFinal: a.chainFinal,
    }))
  );

  writeCsv(
    outDir,
    "db_wallet_chain_transfers.csv",
    chainTransfers.map((t) => ({
      id: t.id,
      walletId: t.walletId,
      txId: t.txId,
      type: t.type,
      amountUsdt: t.amountUsdt,
      status: t.status,
      statusFinal: t.statusFinal,
      chainDate: t.chainDate,
    }))
  );

  writeCsv(
    outDir,
    "db_treasury_events.csv",
    treasuryEvents.map((e) => ({
      id: e.id,
      type: e.type,
      amountUsdt: e.amountUsdt,
      investmentId: e.investmentId,
      purchaseOrderId: e.purchaseOrderId,
      createdAt: e.createdAt,
    }))
  );

  writeCsv(
    outDir,
    "db_treasury_ledger.csv",
    treasuryLedger.map((l) => ({
      id: l.id,
      poolAvailable: l.poolAvailable,
      treasurySurplus: l.treasurySurplus,
      protectedRevenueCredited: l.protectedRevenueCredited,
      protectedRevenueWithdrawn: l.protectedRevenueWithdrawn,
      updatedAt: l.updatedAt,
    }))
  );

  writeCsv(
    outDir,
    "db_admin_on_chain.csv",
    adminOnChain.map((t) => ({
      txId: t.txId,
      category: t.category,
      direction: t.direction,
      amountUsdt: t.amountUsdt,
      status: t.status,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      fromWalletId: t.fromWalletId,
      toWalletId: t.toWalletId,
      chainDate: t.chainDate,
    }))
  );

  writeCsv(
    outDir,
    "db_fee_sponsorships.csv",
    feeSponsorships.map((f) => ({
      id: f.id,
      userId: f.userId,
      walletId: f.walletId,
      topUpTxId: f.topUpTxId,
      usdtTxId: f.usdtTxId,
      status: f.status,
      date: f.date,
    }))
  );

  writeCsv(
    outDir,
    "db_profiles.csv",
    profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      date: p.date,
    }))
  );

  writeCsv(
    outDir,
    "db_photos.csv",
    photos.map((p) => ({
      id: p.id,
      userId: p.userId,
    }))
  );

  return {
    users,
    wallets,
    investments,
    purchaseOrders,
    failedInvestments,
    walletActivities,
    chainTransfers,
    treasuryEvents,
    treasuryLedger,
  };
}

async function fetchChainForAddress(
  address: string,
  maxRows: number
): Promise<CsvRow[]> {
  const rows = await tron.getTrc20UsdtTransfersPaginated(address, { maxRows });
  const enriched = await tron.enrichTrc20TransferStatuses(rows, {
    concurrency: 4,
    fallbackStatusOnLookupError: "confirmed",
  });
  return enriched.map((r) => ({
    address,
    txId: r.txId,
    type: r.type,
    amountUsdt: r.amount,
    status: r.status,
    chainDate: r.date,
    from: r.from,
    to: r.to,
  }));
}

async function exportChain(
  outDir: string,
  wallets: Array<{ address: string }>
): Promise<Map<string, CsvRow[]>> {
  const env = getEnv();
  const treasury = env.treasuryAddress?.trim();
  const maxRows = env.adminWalletTxMax;
  const byAddress = new Map<string, CsvRow[]>();

  if (treasury) {
    console.log("[audit] Fetching treasury TRC20:", treasury);
    const treasuryRows = await fetchChainForAddress(treasury, maxRows);
    byAddress.set(treasury, treasuryRows);
    writeCsv(outDir, "chain_treasury_trc20.csv", treasuryRows);
  } else {
    console.warn("[audit] TREASURY_ADDRESS not set — skipping treasury chain fetch");
  }

  const addresses = [...new Set(wallets.map((w) => w.address).filter(Boolean))];
  for (const address of addresses) {
    console.log("[audit] Fetching wallet TRC20:", address);
    try {
      const rows = await fetchChainForAddress(address, maxRows);
      byAddress.set(address, rows);
      writeCsv(
        outDir,
        `chain_wallet_${shortAddress(address)}.csv`,
        rows
      );
    } catch (error) {
      console.error(
        "[audit] chain fetch failed",
        address,
        error instanceof Error ? error.message : error
      );
      writeCsv(outDir, `chain_wallet_${shortAddress(address)}.csv`, [
        {
          address,
          error: error instanceof Error ? error.message : String(error),
        },
      ]);
    }
  }

  return byAddress;
}

async function inspectOrderTxIds(
  outDir: string,
  purchaseOrders: Array<
    Pick<PurchaseOrder, "usdtTxId" | "failedUsdtTxIds" | "costUsdt" | "fundId">
  >
): Promise<Map<string, string>> {
  const treasury = getEnv().treasuryAddress;
  const txIdToOrder = new Map<string, (typeof purchaseOrders)[number]>();
  const txIds = new Set<string>();
  for (const order of purchaseOrders) {
    if (order.usdtTxId) {
      txIds.add(order.usdtTxId);
      txIdToOrder.set(order.usdtTxId, order);
    }
    for (const id of order.failedUsdtTxIds ?? []) {
      if (id) {
        txIds.add(id);
        txIdToOrder.set(id, order);
      }
    }
  }

  const outcomes = new Map<string, string>();
  const inspectionRows: CsvRow[] = [];

  for (const txId of txIds) {
    try {
      const order = txIdToOrder.get(txId);
      const context =
        treasury && order
          ? buildFundPaymentContext(
              {
                fundId: order.fundId,
                costUsdt: order.costUsdt,
              } as PurchaseOrder,
              treasury
            )
          : undefined;
      const resolution = await resolvePaymentFromTxIds(
        [txId],
        inspectUsdtPaymentTx,
        context
      );
      outcomes.set(txId, resolution.outcome);
      const inspection = await inspectUsdtPaymentTx(txId);
      inspectionRows.push({
        txId,
        outcome: resolution.outcome,
        chainStatus: inspection.status,
        usdtTransferSuccessful: inspection.usdtTransferSuccessful,
        lookupFailed: inspection.lookupFailed ?? false,
      });
    } catch (error) {
      inspectionRows.push({
        txId,
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  writeCsv(outDir, "chain_tx_inspections.csv", inspectionRows);
  return outcomes;
}

async function buildComparisons(
  outDir: string,
  data: Awaited<ReturnType<typeof exportDatabase>>,
  chainByAddress: Map<string, CsvRow[]>,
  txOutcomes: Map<string, string>
) {
  const treasury = getEnv().treasuryAddress?.trim();
  const treasuryChain = treasury ? chainByAddress.get(treasury) ?? [] : [];
  const treasuryByTxId = new Map(
    treasuryChain.map((r) => [String(r.txId), r])
  );

  const walletChainByTxId = new Map<string, CsvRow>();
  for (const [address, rows] of chainByAddress) {
    if (address === treasury) continue;
    for (const row of rows) {
      if (row.txId) {
        walletChainByTxId.set(String(row.txId), { ...row, walletAddress: address });
      }
    }
  }

  const compareOrders: CsvRow[] = [];
  for (const order of data.purchaseOrders) {
    const txId = order.usdtTxId;
    const treasuryRow = txId ? treasuryByTxId.get(txId) : undefined;
    const walletRow = txId ? walletChainByTxId.get(txId) : undefined;
    const inspectionOutcome = txId ? txOutcomes.get(txId) : undefined;
    let mismatch = "";
    if (order.status === "completed" && inspectionOutcome === "failed") {
      mismatch = "completed_order_but_chain_failed";
    }
    if (order.status === "failed" && inspectionOutcome === "success") {
      mismatch = "failed_order_but_chain_success";
    }
    if (order.status === "completed" && !txId) {
      mismatch = "completed_without_usdt_tx_id";
    }
    compareOrders.push({
      orderId: order.id,
      orderStatus: order.status,
      paymentChainOutcome: order.paymentChainOutcome,
      paymentChainFinal: order.paymentChainFinal,
      usdtTxId: txId,
      inspectionOutcome,
      treasuryChainAmount: treasuryRow?.amountUsdt ?? null,
      treasuryChainStatus: treasuryRow?.status ?? null,
      walletChainType: walletRow?.type ?? null,
      mismatch: mismatch || null,
    });
  }
  writeCsv(outDir, "compare_orders_vs_chain.csv", compareOrders);

  const invByTxId = new Map<string, typeof data.investments>();
  for (const inv of data.investments) {
    const txId = txIdFromJson(inv.transaction);
    if (!txId) continue;
    const list = invByTxId.get(txId) ?? [];
    list.push(inv);
    invByTxId.set(txId, list);
  }

  const compareInvOrders: CsvRow[] = [];
  for (const order of data.purchaseOrders) {
    const txId = order.usdtTxId;
    if (!txId) continue;
    const invs = invByTxId.get(txId) ?? [];
    compareInvOrders.push({
      txId,
      orderId: order.id,
      orderStatus: order.status,
      investmentIds: invs.map((i) => i.id).join("|"),
      investmentStatuses: invs.map((i) => i.status).join("|"),
      investmentCount: invs.length,
    });
  }
  writeCsv(outDir, "compare_investments_vs_orders.csv", compareInvOrders);

  const activityByTxId = new Map<string, typeof data.walletActivities>();
  for (const act of data.walletActivities) {
    if (!act.txId) continue;
    const list = activityByTxId.get(act.txId) ?? [];
    list.push(act);
    activityByTxId.set(act.txId, list);
  }

  const compareDuplicates: CsvRow[] = [];
  for (const [txId, acts] of activityByTxId) {
    if (acts.length <= 1) continue;
    const kinds = [...new Set(acts.map((a) => a.kind))];
    const hasInvAndOrder =
      kinds.includes("investment") && kinds.includes("purchase_order");
    compareDuplicates.push({
      txId,
      rowCount: acts.length,
      kinds: kinds.join("|"),
      labels: acts.map((a) => a.label).join(" | "),
      issue: hasInvAndOrder
        ? "investment_and_purchase_order_duplicate"
        : "multiple_rows_same_txId",
    });
  }
  writeCsv(outDir, "compare_activity_duplicates.csv", compareDuplicates);

  const compareBalance: CsvRow[] = [];
  for (const wallet of data.wallets) {
    let liveBalance: number | null = null;
    try {
      if (await tron.validateAddress(wallet.address)) {
        liveBalance = await tron.getUsdtBalance(wallet.address);
      }
    } catch {
      liveBalance = null;
    }
    const cached = wallet.onChainUsdtCached ?? null;
    compareBalance.push({
      walletId: wallet.id,
      address: wallet.address,
      onChainUsdtCached: cached,
      liveOnChainUsdt: liveBalance,
      delta:
        cached != null && liveBalance != null
          ? parseFloat((liveBalance - cached).toFixed(6))
          : null,
      activitySyncedAt: wallet.activitySyncedAt,
    });
  }
  writeCsv(outDir, "compare_balance.csv", compareBalance);

  const neverSyncedWallets = data.wallets.filter((w) => !w.activitySyncedAt);
  const walletsWithInvNoActivity: string[] = [];
  for (const wallet of data.wallets) {
    const invCount = data.investments.filter(
      (i) => i.walletId === wallet.id
    ).length;
    const actCount = data.walletActivities.filter(
      (a) => a.walletId === wallet.id
    ).length;
    if (invCount > 0 && actCount === 0) {
      walletsWithInvNoActivity.push(wallet.id);
    }
  }

  const mismatchedOrders = compareOrders.filter((r) => r.mismatch);

  const orderById = new Map(data.purchaseOrders.map((o) => [o.id, o]));

  async function resolveOrderAllTxs(order: PurchaseOrder): Promise<{
    outcome: string;
    winningTxId?: string;
  }> {
    const txIds = collectPaymentTxIdsFromOrder(order);
    if (!txIds.length) {
      return { outcome: "pending" };
    }
    const context = treasury
      ? buildFundPaymentContext(order, treasury)
      : undefined;
    return resolvePaymentFromTxIds(txIds, inspectUsdtPaymentTx, context);
  }

  const compareAllPaymentTxs: CsvRow[] = [];
  for (const order of data.purchaseOrders) {
    for (const txId of collectPaymentTxIdsFromOrder(order)) {
      const outcome = txOutcomes.get(txId) ?? "unknown";
      compareAllPaymentTxs.push({
        source: "purchase_order",
        entityId: order.id,
        walletId: order.walletId,
        txId,
        dbStatus: order.status,
        treasuryInflow: treasuryByTxId.has(txId) ? "yes" : "no",
        inspectionOutcome: outcome,
        amountUsdt: order.costUsdt,
      });
    }
  }
  for (const inv of data.investments) {
    const txId = txIdFromJson(inv.transaction);
    if (!txId) continue;
    compareAllPaymentTxs.push({
      source: "investment",
      entityId: inv.id,
      walletId: inv.walletId,
      txId,
      dbStatus: inv.status,
      treasuryInflow: treasuryByTxId.has(txId) ? "yes" : "no",
      inspectionOutcome: txOutcomes.get(txId) ?? null,
      amountUsdt: inv.amountUsdt,
    });
  }
  for (const item of data.failedInvestments) {
    const txId = txIdFromJson(item.transaction);
    if (!txId) continue;
    compareAllPaymentTxs.push({
      source: "failed_investment",
      entityId: item.id,
      walletId: item.walletId,
      dbStatus: "failed",
      txId,
      treasuryInflow: treasuryByTxId.has(txId) ? "yes" : "no",
      inspectionOutcome: txOutcomes.get(txId) ?? null,
      amountUsdt: item.amountUsdt,
    });
  }
  writeCsv(outDir, "compare_all_payment_txs.csv", compareAllPaymentTxs);

  const compareFalseFailedOrders: CsvRow[] = [];
  for (const order of data.purchaseOrders.filter((o) => o.status === "failed")) {
    const resolution = await resolveOrderAllTxs(order);
    const treasuryInflow = collectPaymentTxIdsFromOrder(order).some((id) =>
      treasuryByTxId.has(id)
    );
    let recommendedAction = "needs_review";
    if (resolution.outcome === "success" || treasuryInflow) {
      recommendedAction = "heal_to_completed";
    } else if (resolution.outcome === "failed") {
      recommendedAction = "confirm_failed";
    }
    compareFalseFailedOrders.push({
      orderId: order.id,
      walletId: order.walletId,
      paymentChainOutcome: order.paymentChainOutcome,
      allTxIds: collectPaymentTxIdsFromOrder(order).join("|"),
      resolutionOutcome: resolution.outcome,
      winningTxId: resolution.winningTxId ?? null,
      treasuryInflow: treasuryInflow ? "yes" : "no",
      recommendedAction,
    });
  }
  writeCsv(outDir, "compare_false_failed_orders.csv", compareFalseFailedOrders);

  const compareFalseFailedInvestments: CsvRow[] = [];
  for (const item of data.failedInvestments) {
    const txId = txIdFromJson(item.transaction);
    const outcome = txId ? txOutcomes.get(txId) : null;
    const shouldExist = outcome !== "success";
    compareFalseFailedInvestments.push({
      id: item.id,
      walletId: item.walletId,
      fundId: item.fundId,
      txId,
      inspectionOutcome: outcome,
      shouldExist,
      treasuryInflow: txId && treasuryByTxId.has(txId) ? "yes" : "no",
    });
  }
  writeCsv(
    outDir,
    "compare_false_failed_investments.csv",
    compareFalseFailedInvestments
  );

  const compareUiFalseFailed: CsvRow[] = [];
  for (const act of data.walletActivities.filter((a) => a.status === "failed")) {
    let dbOrderStatus: string | null = null;
    let paymentChainOutcome: string | null = null;
    if (act.kind === "purchase_order" && act.entityId) {
      const order = orderById.get(act.entityId);
      dbOrderStatus = order?.status ?? null;
      paymentChainOutcome = order?.paymentChainOutcome ?? null;
    }
    const chainSaysSuccess =
      (act.txId && txOutcomes.get(act.txId) === "success") ||
      (act.txId && treasuryByTxId.has(act.txId)) ||
      paymentChainOutcome === "success";
    if (chainSaysSuccess) {
      compareUiFalseFailed.push({
        activityId: act.id,
        walletId: act.walletId,
        kind: act.kind,
        entityId: act.entityId,
        txId: act.txId,
        label: act.label,
        dbOrderStatus,
        paymentChainOutcome,
        inspectionOutcome: act.txId ? txOutcomes.get(act.txId) : null,
      });
    }
  }
  writeCsv(outDir, "compare_ui_false_failed.csv", compareUiFalseFailed);

  const subscribeInflows = data.treasuryEvents.filter(
    (e) => e.type === TreasuryEventType.subscribe_inflow
  );
  const completedOrderTxIds = new Set(
    data.purchaseOrders
      .filter((o) => o.status === "completed" && o.usdtTxId)
      .map((o) => o.usdtTxId as string)
  );
  const compareTreasuryPool: CsvRow[] = [];
  const treasuryInflows = (treasuryChain ?? []).filter((r) => r.type === "in");
  for (const row of treasuryInflows) {
    const txId = String(row.txId);
    compareTreasuryPool.push({
      txId,
      direction: "in",
      amountUsdt: row.amountUsdt,
      matchedCompletedOrder: completedOrderTxIds.has(txId) ? "yes" : "no",
      matchedSubscribeEvent: subscribeInflows.some(
        (e) =>
          data.purchaseOrders.find(
            (o) => o.id === e.purchaseOrderId && o.usdtTxId === txId
          ) != null
      )
        ? "yes"
        : "no",
      issue: completedOrderTxIds.has(txId) ? null : "unmatched_treasury_inflow",
    });
  }
  writeCsv(outDir, "compare_treasury_pool.csv", compareTreasuryPool);

  const falseFailedOrders = compareFalseFailedOrders.filter(
    (r) => r.recommendedAction === "heal_to_completed"
  ).length;
  const falseFailedInvestments = compareFalseFailedInvestments.filter(
    (r) => r.shouldExist === false
  ).length;
  const orphanFailedInvestmentsWithChainSuccess = compareFalseFailedInvestments.filter(
    (r) => r.inspectionOutcome === "success"
  ).length;

  const topIssues = [
    ...compareUiFalseFailed.slice(0, 20).map((d) => ({
      type: "ui_false_failed",
      detail: `${d.txId}:${d.label}`,
    })),
    ...compareFalseFailedOrders
      .filter((d) => d.recommendedAction === "heal_to_completed")
      .slice(0, 20)
      .map((d) => ({
        type: "false_failed_order",
        detail: String(d.orderId),
      })),
    ...compareDuplicates.slice(0, 10).map((d) => ({
      type: "duplicate_activity",
      detail: String(d.txId),
    })),
    ...mismatchedOrders.slice(0, 10).map((d) => ({
      type: "order_chain_mismatch",
      detail: `${d.orderId}:${d.mismatch}`,
    })),
  ].slice(0, 50);

  return {
    neverSyncedWallets: neverSyncedWallets.length,
    activityDuplicateGroups: compareDuplicates.length,
    mismatchedOrders: mismatchedOrders.length,
    walletsWithInvNoActivity,
    falseFailedUiRows: compareUiFalseFailed.length,
    falseFailedOrders,
    falseFailedInvestments,
    orphanFailedInvestmentsWithChainSuccess,
    ledgerMismatch: compareTreasuryPool.some((r) => r.issue),
    topIssues,
  };
}

async function main() {
  const env = getEnv();
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "tmp", `audit-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log("[audit] Output:", outDir);
  console.log("[audit] Network:", env.blockchainNetwork);

  const dbData = await exportDatabase(outDir);
  console.log("[audit] DB exported:", {
    users: dbData.users.length,
    wallets: dbData.wallets.length,
    investments: dbData.investments.length,
    purchaseOrders: dbData.purchaseOrders.length,
    walletActivities: dbData.walletActivities.length,
  });

  const chainByAddress = await exportChain(outDir, dbData.wallets);
  const txOutcomes = await inspectOrderTxIds(outDir, dbData.purchaseOrders);

  const summary = await buildComparisons(
    outDir,
    dbData,
    chainByAddress,
    txOutcomes
  );
  const fullSummary = {
    generatedAt: new Date().toISOString(),
    network: env.blockchainNetwork,
    treasuryAddress: env.treasuryAddress || null,
    counts: {
      users: dbData.users.length,
      wallets: dbData.wallets.length,
      investments: dbData.investments.length,
      purchaseOrders: dbData.purchaseOrders.length,
      walletActivities: dbData.walletActivities.length,
      chainTransferRows: dbData.chainTransfers.length,
    },
    ...summary,
  };

  fs.writeFileSync(
    path.join(outDir, "audit_summary.json"),
    JSON.stringify(fullSummary, null, 2),
    "utf8"
  );

  console.log("\n=== Audit summary ===");
  console.log(JSON.stringify(fullSummary, null, 2));
  console.log("\n[audit] Done. CSVs in:", outDir);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
