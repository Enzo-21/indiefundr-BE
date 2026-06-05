"use server";

import { actionError } from "@/actions/_lib/actionResult";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import { createAdminWithdrawal } from "@/services/admin/treasury";

export async function requestWithdrawal(input: {
  amountUsdt: number;
  txRef?: string;
  note?: string;
}) {
  if (!Number.isFinite(input.amountUsdt) || input.amountUsdt <= 0) {
    return actionError("BAD_REQUEST", "amountUsdt must be a positive number");
  }

  return withAdminAction(async ({ createdBy }) => {
    return createAdminWithdrawal({
      amountUsdt: input.amountUsdt,
      txRef: input.txRef,
      note: input.note,
      createdBy,
    });
  });
}
