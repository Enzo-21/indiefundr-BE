import {
  PurchaseOrderFulfillmentMode,
  PurchaseOrderStatus,
  ReferralPayoutOrderStatus,
  WithdrawalOrderStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const OPEN_PURCHASE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.queued,
  PurchaseOrderStatus.processing,
];

const OPEN_WITHDRAWAL_STATUSES: WithdrawalOrderStatus[] = [
  WithdrawalOrderStatus.queued,
  WithdrawalOrderStatus.processing,
];

const OPEN_REFERRAL_STATUSES: ReferralPayoutOrderStatus[] = [
  ReferralPayoutOrderStatus.queued,
  ReferralPayoutOrderStatus.processing,
];

export async function getAdminPendingOrderCount(): Promise<number> {
  const [pendingInvestmentCount, pendingWithdrawalCount, pendingReferralCount] =
    await Promise.all([
      prisma.purchaseOrder.count({
        where: {
          fulfillmentMode: PurchaseOrderFulfillmentMode.manual,
          status: { in: OPEN_PURCHASE_STATUSES },
        },
      }),
      prisma.withdrawalOrder.count({
        where: { status: { in: OPEN_WITHDRAWAL_STATUSES } },
      }),
      prisma.referralPayoutOrder.count({
        where: { status: { in: OPEN_REFERRAL_STATUSES } },
      }),
    ]);

  return pendingInvestmentCount + pendingWithdrawalCount + pendingReferralCount;
}
