import { getFundById } from "@/lib/config/investmentFunds";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/services/orders/pushNotify";
import type { MaturedInvestmentSummary } from "./maturity";

export type MaturityNotificationResult = {
  notifiedCount: number;
  skippedNoDevice: number;
};

export async function notifyMaturedInvestments(
  matured: MaturedInvestmentSummary[]
): Promise<MaturityNotificationResult> {
  if (matured.length === 0) {
    return { notifiedCount: 0, skippedNoDevice: 0 };
  }

  const userIds = [...new Set(matured.map((row) => row.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, device: true },
  });
  const deviceByUserId = new Map(users.map((user) => [user.id, user.device]));

  let notifiedCount = 0;
  let skippedNoDevice = 0;

  const investmentRows =
    matured.length > 0
      ? await prisma.investment.findMany({
          where: { id: { in: matured.map((row) => row.id) } },
          select: {
            id: true,
            unpaidMaturityChoiceDeadlineAt: true,
          },
        })
      : [];
  const choiceDeadlineById = new Map(
    investmentRows.map((row) => [row.id, row.unpaidMaturityChoiceDeadlineAt])
  );

  for (const investment of matured) {
    const device = deviceByUserId.get(investment.userId);
    if (!device?.trim()) {
      skippedNoDevice += 1;
      continue;
    }

    const fundName =
      getFundById(investment.fundId)?.name ?? investment.fundId;
    const needsChoice =
      choiceDeadlineById.get(investment.id) != null;

    try {
      await sendPushNotification(
        device,
        "Investment matured",
        needsChoice
          ? `Your ${fundName} position matured. Choose recover or wait within 48 hours in the app.`
          : `Your ${fundName} position has reached its term.`,
        {
          type: needsChoice
            ? "UNPAID_MATURITY_CHOICE_REQUIRED"
            : "INVESTMENT_MATURED",
          investmentId: investment.id,
          fundId: investment.fundId,
        }
      );
      notifiedCount += 1;
    } catch (error) {
      console.warn("[maturity] push notification failed", {
        investmentId: investment.id,
        userId: investment.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { notifiedCount, skippedNoDevice };
}
