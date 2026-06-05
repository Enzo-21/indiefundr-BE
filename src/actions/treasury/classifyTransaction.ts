"use server";

import { actionError } from "@/actions/_lib/actionResult";
import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  linkTreasuryOutflowAsAppWithdrawal,
  unlinkAppWithdrawalFromLedger,
  type ClassifyTreasuryWithdrawalIntent,
} from "@/services/admin/treasuryTxClassification";
import {
  clearTreasuryInflowClassification,
  linkTreasuryInflowAsSurplus,
  linkTreasuryInflowAsWithdrawable,
  switchTreasuryInflowToWithdrawable,
  type ClassifyTreasuryInflowIntent,
} from "@/services/admin/treasuryInflowClassification";
import { isInsufficientWithdrawalError } from "@/services/admin/treasury";
import { prisma } from "@/lib/prisma";
import { treatmentFromAuditRow } from "@/services/revenueEngine/externalTreasuryInflows";

export type ClassifyTreasuryTransactionIntent =
  | ClassifyTreasuryWithdrawalIntent
  | ClassifyTreasuryInflowIntent;

export async function classifyTreasuryTransaction(input: {
  txId: string;
  intent: ClassifyTreasuryTransactionIntent;
  note?: string;
  amountUsdt?: number;
}) {
  const txId = input.txId?.trim();
  if (!txId) {
    return actionError("BAD_REQUEST", "txId is required");
  }
  if (
    input.intent !== "link_withdrawal" &&
    input.intent !== "unlink_withdrawal" &&
    input.intent !== "mark_inflow_withdrawable" &&
    input.intent !== "mark_inflow_surplus" &&
    input.intent !== "clear_inflow_classification"
  ) {
    return actionError("BAD_REQUEST", "Invalid classification intent");
  }

  return withAdminAction(async ({ createdBy: adminEmail }) => {
    try {
      if (input.intent === "link_withdrawal") {
        return linkTreasuryOutflowAsAppWithdrawal({
          txId,
          amountUsdt: input.amountUsdt,
          note: input.note,
          adminEmail,
        });
      }
      if (input.intent === "unlink_withdrawal") {
        return unlinkAppWithdrawalFromLedger({
          txId,
          note: input.note,
          adminEmail,
        });
      }
      if (input.intent === "mark_inflow_withdrawable") {
        const audit = await prisma.adminOnChainTransaction.findFirst({
          where: { txId, direction: "in" },
          select: { poolInflowRecordedAt: true, adminSurplusMarkedAt: true },
        });
        if (audit && treatmentFromAuditRow(audit) === "surplus") {
          return switchTreasuryInflowToWithdrawable({
            txId,
            note: input.note,
            adminEmail,
          });
        }
        return linkTreasuryInflowAsWithdrawable({
          txId,
          amountUsdt: input.amountUsdt,
          note: input.note,
          adminEmail,
        });
      }
      if (input.intent === "mark_inflow_surplus") {
        return linkTreasuryInflowAsSurplus({
          txId,
          amountUsdt: input.amountUsdt,
          note: input.note,
          adminEmail,
        });
      }
      return clearTreasuryInflowClassification({
        txId,
        note: input.note,
        adminEmail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isInsufficientWithdrawalError(message)) {
        throw error;
      }
      throw error;
    }
  });
}
