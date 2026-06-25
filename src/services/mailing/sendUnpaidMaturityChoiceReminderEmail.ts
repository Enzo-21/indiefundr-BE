import { render } from "@react-email/render";
import type { Investment, User } from "@prisma/client";
import InvestmentMaturedEmail from "@/emails/InvestmentMaturedEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { UNPAID_MATURITY_CHOICE_HOURS } from "@/lib/config/unpaidMaturityChoice";
import {
  getResendClient,
  getResendErrorMessage,
  mailingFromAddress,
} from "./resendClient";
import { resolveMailingLogoUrl } from "./mailingLogoUrl";
import { portfolioDeepLink } from "./sendInvestmentMaturedEmail";

export async function sendUnpaidMaturityChoiceReminderEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Investment;
  fund: InvestmentFund;
  choiceDeadlineAt: Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, fund, choiceDeadlineAt } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const choiceHours = UNPAID_MATURITY_CHOICE_HOURS();
    const portfolioUrl = portfolioDeepLink(investment.id);
    const deadlineLabel = choiceDeadlineAt.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const html = await render(
      InvestmentMaturedEmail({
        username: user.name || "",
        fundName: fund.name,
        amountUsdt: investment.amountUsdt,
        projectedPayoutUsdt: investment.projectedPayoutUsdt,
        needsUnpaidMaturityChoice: true,
        choiceHours,
        portfolioUrl,
        logoUrl: resolveMailingLogoUrl(),
      })
    );

    const subject = `Reminder: choose your next step for ${fund.name}`;
    const text =
      `Reminder: your ${fund.name} investment needs a choice before ${deadlineLabel}. ` +
      `Open Portfolio: ${portfolioUrl}`;

    const { error } = await resend.emails.send({
      from: mailingFromAddress(),
      to: [user.email],
      subject,
      text,
      html,
    });

    if (error) {
      return { ok: false, error: getResendErrorMessage(error) };
    }

    return { ok: true };
  } catch (err) {
    console.error(
      "sendUnpaidMaturityChoiceReminderEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
