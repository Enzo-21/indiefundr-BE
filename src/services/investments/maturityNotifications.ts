import type { Investment } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import {
  isChoiceDeadlineActive,
  UNPAID_MATURITY_CHOICE_HOURS,
} from "@/lib/config/unpaidMaturityChoice";
import { prisma } from "@/lib/prisma";
import { sendInvestmentMaturedEmail } from "@/services/mailing/sendInvestmentMaturedEmail";
import { sendPushNotification } from "@/services/orders/pushNotify";
import {
  isUnpaidMaturityChoicePending,
  loadFifoEligibleIds,
} from "@/services/investments/unpaidMaturityChoice";

export type MaturityNotificationResult = {
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  pushSent: number;
  pushSkippedNoDevice: number;
  pushFailed: number;
};

export function needsUnpaidMaturityChoiceFromInvestment(
  investment: Pick<
    Investment,
    | "status"
    | "unpaidMaturityChoiceDeadlineAt"
    | "unpaidMaturityResolution"
    | "payoutUnlockedAt"
  >,
  now: Date = new Date()
): boolean {
  return (
    investment.status === "matured" &&
    investment.unpaidMaturityChoiceDeadlineAt != null &&
    isChoiceDeadlineActive(investment.unpaidMaturityChoiceDeadlineAt, now) &&
    investment.unpaidMaturityResolution == null &&
    investment.payoutUnlockedAt == null
  );
}

async function sendMaturityPush(
  investment: Pick<Investment, "id" | "fundId" | "userId">,
  device: string,
  needsChoice: boolean
): Promise<boolean> {
  const fundName = getFundById(investment.fundId)?.name ?? investment.fundId;
  const choiceHours = UNPAID_MATURITY_CHOICE_HOURS();

  try {
    await sendPushNotification(
      device,
      "Investment matured",
      needsChoice
        ? `Your ${fundName} position matured. Choose recover or wait within ${choiceHours} hours in the app.`
        : `Your ${fundName} position has reached its term.`,
      {
        type: needsChoice
          ? "UNPAID_MATURITY_CHOICE_REQUIRED"
          : "INVESTMENT_MATURED",
        investmentId: investment.id,
        fundId: investment.fundId,
      }
    );
    return true;
  } catch (error) {
    console.warn("[maturity] push notification failed", {
      investmentId: investment.id,
      userId: investment.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** @deprecated Use notifyNewlyMaturedInvestments */
export async function notifyMaturedInvestments(
  matured: Array<{ id: string; userId: string; fundId: string }>
): Promise<{ notifiedCount: number; skippedNoDevice: number }> {
  const result = await notifyNewlyMaturedInvestments(matured.map((row) => row.id));
  return {
    notifiedCount: result.pushSent,
    skippedNoDevice: result.pushSkippedNoDevice,
  };
}

export async function notifyNewlyMaturedInvestments(
  investmentIds: string[]
): Promise<MaturityNotificationResult> {
  const empty: MaturityNotificationResult = {
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    pushSent: 0,
    pushSkippedNoDevice: 0,
    pushFailed: 0,
  };

  if (investmentIds.length === 0) {
    return empty;
  }

  const investments = await prisma.investment.findMany({
    where: { id: { in: investmentIds } },
    include: {
      user: { select: { id: true, email: true, name: true, device: true } },
    },
  });

  const result = { ...empty };
  const now = new Date();
  const fifoIds = await loadFifoEligibleIds();

  for (const investment of investments) {
    if (investment.maturityNotifiedAt) {
      result.emailsSkipped += 1;
      continue;
    }

    const needsChoice = isUnpaidMaturityChoicePending(investment, fifoIds, now);
    const fund = getFundById(investment.fundId);
    if (!fund) {
      console.warn("[maturity] unknown fund for notification", {
        investmentId: investment.id,
        fundId: investment.fundId,
      });
      continue;
    }

    let emailOk = false;
    if (investment.user.email?.trim()) {
      const emailResult = await sendInvestmentMaturedEmail({
        user: investment.user,
        investment,
        fund,
        needsUnpaidMaturityChoice: needsChoice,
      });
      if (emailResult.ok) {
        emailOk = true;
        result.emailsSent += 1;
      } else {
        result.emailsFailed += 1;
        console.warn("[maturity] email failed", {
          investmentId: investment.id,
          error: emailResult.error,
        });
      }
    } else {
      result.emailsSkipped += 1;
    }

    let pushOk = false;
    const device = investment.user.device?.trim();
    if (device) {
      pushOk = await sendMaturityPush(investment, device, needsChoice);
      if (pushOk) {
        result.pushSent += 1;
      } else {
        result.pushFailed += 1;
      }
    } else {
      result.pushSkippedNoDevice += 1;
    }

    if (emailOk || pushOk) {
      await prisma.investment.update({
        where: { id: investment.id },
        data: { maturityNotifiedAt: now },
      });
    }
  }

  return result;
}
