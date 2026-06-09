"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import type { ListAdminInvestmentsOptions } from "@/services/admin/adminInvestmentListQuery";
import { getAdminPayoutSummary } from "@/services/admin/adminPayoutSummary";
import {
  getAdminOverviewStats,
  getTronLimiterDiagnostics,
  listAdminInvestments,
  listAdminUsers,
  listAppWithdrawals,
  listFundedUsers,
} from "@/services/admin/dashboard";
import {
  payInvestmentNow,
  payInvestmentWithSurplus,
} from "@/services/admin/payout";
import { markMaturedInvestments } from "@/services/investments/maturity";
import { revalidatePath } from "next/cache";

export async function fetchAdminOverview() {
  return withAdminAction(() => getAdminOverviewStats());
}

export async function fetchAdminUsers() {
  return withAdminAction(() => listAdminUsers());
}

export async function fetchFundedUsers(limit = 15) {
  return withAdminAction(() => listFundedUsers({ limit }));
}

export async function fetchAdminInvestments(
  options: ListAdminInvestmentsOptions = {}
) {
  return withAdminAction(() => listAdminInvestments(options));
}

export async function fetchAdminPayoutSummary() {
  return withAdminAction(() => getAdminPayoutSummary());
}

export async function fetchAppWithdrawals() {
  return withAdminAction(() => listAppWithdrawals());
}

export async function fetchTronLimiterDiagnostics() {
  return withAdminAction(() => getTronLimiterDiagnostics());
}

export async function adminPayInvestmentNow(investmentId: string) {
  const result = await withAdminAction(async () => {
    await markMaturedInvestments();
    return payInvestmentNow(investmentId);
  });
  if (result.ok) {
    revalidatePath("/admin/investments");
    revalidatePath("/admin/treasury");
    revalidatePath("/admin/dashboard");
  }
  return result;
}

export async function adminPayInvestmentWithSurplus(investmentId: string) {
  const result = await withAdminAction(async () => {
    await markMaturedInvestments();
    return payInvestmentWithSurplus(investmentId);
  });
  if (result.ok) {
    revalidatePath("/admin/investments");
    revalidatePath("/admin/treasury");
    revalidatePath("/admin/dashboard");
  }
  return result;
}
