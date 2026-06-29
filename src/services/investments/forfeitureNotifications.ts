import type { ForfeitureReason, Investment } from "@prisma/client";
import { getFundById } from "@/lib/config/investmentFunds";
import { prisma } from "@/lib/prisma";
import { sendInvestmentForfeitedEmail } from "@/services/mailing/sendInvestmentForfeitedEmail";
import { sendPushNotification } from "@/services/orders/pushNotify";

function forfeiturePushMessage(
  fundName: string,
  reason: ForfeitureReason
): { title: string; body: string } {
  switch (reason) {
    case "choice_deadline_expired":
      return {
        title: "Investment ended",
        body: `Your ${fundName} position ended because no choice was made in time.`,
      };
    case "second_maturity_unpaid":
      return {
        title: "Extended term ended",
        body: `Your ${fundName} extended term ended without payout.`,
      };
    case "recovery_window_expired":
      return {
        title: "Recovery window closed",
        body: `Your ${fundName} invite recovery window closed without enough qualified friends.`,
      };
    default:
      return {
        title: "Investment ended",
        body: `Your ${fundName} investment is no longer active.`,
      };
  }
}

export async function notifyInvestmentForfeited(
  investment: Pick<Investment, "id" | "userId" | "fundId" | "amountUsdt"> & {
    forfeitureReason: ForfeitureReason | null;
    forfeitureNotifiedAt: Date | null;
  },
  now: Date = new Date()
): Promise<{ emailSent: boolean; pushSent: boolean }> {
  if (!investment.forfeitureReason || investment.forfeitureNotifiedAt) {
    return { emailSent: false, pushSent: false };
  }

  const [user, fund] = await Promise.all([
    prisma.user.findUnique({
      where: { id: investment.userId },
      select: { email: true, name: true, device: true },
    }),
    Promise.resolve(getFundById(investment.fundId)),
  ]);

  if (!fund) {
    console.warn("[forfeiture] unknown fund for notification", {
      investmentId: investment.id,
      fundId: investment.fundId,
    });
    return { emailSent: false, pushSent: false };
  }

  let emailSent = false;
  if (user?.email?.trim()) {
    const emailResult = await sendInvestmentForfeitedEmail({
      user,
      investment,
      fund,
      forfeitureReason: investment.forfeitureReason,
    });
    if (emailResult.ok) {
      emailSent = true;
    } else {
      console.warn("[forfeiture] email failed", {
        investmentId: investment.id,
        error: emailResult.error,
      });
    }
  }

  let pushSent = false;
  const device = user?.device?.trim();
  if (device) {
    const fundName = fund.name;
    const { title, body } = forfeiturePushMessage(
      fundName,
      investment.forfeitureReason
    );
    try {
      await sendPushNotification(device, title, body, {
        type: "INVESTMENT_FORFEITED",
        investmentId: investment.id,
        fundId: investment.fundId,
        forfeitureReason: investment.forfeitureReason,
      });
      pushSent = true;
    } catch (error) {
      console.warn("[forfeiture] push notification failed", {
        investmentId: investment.id,
        userId: investment.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (emailSent || pushSent) {
    await prisma.investment.update({
      where: { id: investment.id },
      data: { forfeitureNotifiedAt: now },
    });
  }

  return { emailSent, pushSent };
}
