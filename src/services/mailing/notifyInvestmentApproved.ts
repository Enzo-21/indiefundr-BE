import type { Investment, PurchaseOrder, User } from "@prisma/client";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/services/orders/pushNotify";
import { sendInvestmentApprovedEmail } from "./sendInvestmentApprovedEmail";

export async function notifyInvestmentApproved(params: {
  investment: Investment;
  order: PurchaseOrder;
  fund: InvestmentFund;
}): Promise<void> {
  const { investment, order, fund } = params;
  const user = await prisma.user.findUnique({
    where: { id: investment.userId },
    select: { email: true, name: true, device: true },
  });

  if (!user) {
    return;
  }

  const fundName = fund.name;
  const pushToken = order.device ?? user.device ?? null;

  await sendPushNotification(
    pushToken,
    "Investment approved",
    `Your ${fundName} investment is approved — we're working to grow your USDT.`,
    { type: "SUBSCRIBE_FUND_SUCCESS" }
  );

  const emailResult = await sendInvestmentApprovedEmail({
    user,
    investment,
    order,
    fund,
  });

  if (!emailResult.ok) {
    console.error(
      "[mail] investment approved email failed:",
      emailResult.error,
      { investmentId: investment.id, orderId: order.id }
    );
  }
}
