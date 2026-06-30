import { InvestmentStatus } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { UNPAID_MATURITY_CHOICE_HOURS } from "@/lib/config/unpaidMaturityChoice";
import { prisma } from "@/lib/prisma";
import { fieldIsNullOrUnset } from "@/lib/prisma/mongoFieldFilters";
import { sendUnpaidMaturityChoiceReminderEmail } from "@/services/mailing/sendUnpaidMaturityChoiceReminderEmail";
import { isUnpaidMaturityChoicePending, loadFifoEligibleIds } from "./unpaidMaturityChoice";

const MS_PER_HOUR = 60 * 60 * 1000;

export type ChoiceReminderResult = {
  scanned: number;
  remindersSent: number;
  remindersFailed: number;
  remindersSkipped: number;
};

export async function notifyUnpaidMaturityChoiceReminders(
  options: { limit?: number; now?: Date } = {}
): Promise<ChoiceReminderResult> {
  const now = options.now ?? new Date();
  const reminderLeadHours = Math.max(1, UNPAID_MATURITY_CHOICE_HOURS() / 2);
  const fifoIds = await loadFifoEligibleIds();

  const candidates = await prisma.investment.findMany({
    where: {
      AND: [
        { status: InvestmentStatus.matured },
        fieldIsNullOrUnset("unpaidMaturityResolution"),
        { unpaidMaturityChoiceDeadlineAt: { not: null } },
        fieldIsNullOrUnset("choiceReminderNotifiedAt"),
        fieldIsNullOrUnset("payoutUnlockedAt"),
      ],
    },
    orderBy: { unpaidMaturityChoiceDeadlineAt: "asc" },
    ...(options.limit != null ? { take: options.limit } : {}),
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const result: ChoiceReminderResult = {
    scanned: candidates.length,
    remindersSent: 0,
    remindersFailed: 0,
    remindersSkipped: 0,
  };

  for (const investment of candidates) {
    if (!isUnpaidMaturityChoicePending(investment, fifoIds, now)) {
      result.remindersSkipped += 1;
      continue;
    }

    const deadline = investment.unpaidMaturityChoiceDeadlineAt!;
    const msUntilDeadline = deadline.getTime() - now.getTime();
    if (msUntilDeadline > reminderLeadHours * MS_PER_HOUR) {
      result.remindersSkipped += 1;
      continue;
    }

    const fund = getFundById(investment.fundId);
    if (!fund) {
      result.remindersSkipped += 1;
      continue;
    }

    if (!investment.user.email?.trim()) {
      result.remindersSkipped += 1;
      continue;
    }

    const emailResult = await sendUnpaidMaturityChoiceReminderEmail({
      user: investment.user,
      investment,
      fund,
      choiceDeadlineAt: deadline,
    });

    if (emailResult.ok) {
      await prisma.investment.update({
        where: { id: investment.id },
        data: { choiceReminderNotifiedAt: now },
      });
      result.remindersSent += 1;
    } else {
      result.remindersFailed += 1;
      console.warn("[maturity] choice reminder email failed", {
        investmentId: investment.id,
        error: emailResult.error,
      });
    }
  }

  return result;
}
