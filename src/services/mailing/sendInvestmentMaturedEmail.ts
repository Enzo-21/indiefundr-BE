import { render } from "@react-email/render";
import type { Investment, User } from "@prisma/client";
import InvestmentMaturedEmail from "@/emails/InvestmentMaturedEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { UNPAID_MATURITY_CHOICE_HOURS } from "@/lib/config/unpaidMaturityChoice";
import { getEnv } from "@/lib/env";
import {
  getResendClient,
  getResendErrorMessage,
  mailingFromAddress,
} from "./resendClient";
import { resolveMailingLogoUrl } from "./mailingLogoUrl";

export function portfolioDeepLink(investmentId?: string): string {
  const base = getEnv().appWebUrl.replace(/\/$/, "");
  if (!base) {
    return investmentId ? `/portfolio?openMaturityChoice=${investmentId}` : "/portfolio";
  }
  const path = investmentId
    ? `/portfolio?openMaturityChoice=${encodeURIComponent(investmentId)}`
    : "/portfolio";
  return `${base}${path}`;
}

export async function sendInvestmentMaturedEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Investment;
  fund: InvestmentFund;
  needsUnpaidMaturityChoice: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, fund, needsUnpaidMaturityChoice } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const choiceHours = UNPAID_MATURITY_CHOICE_HOURS();
    const portfolioUrl = portfolioDeepLink(
      needsUnpaidMaturityChoice ? investment.id : undefined
    );

    const html = await render(
      InvestmentMaturedEmail({
        username: user.name || "",
        fundName: fund.name,
        amountUsdt: investment.amountUsdt,
        projectedPayoutUsdt: investment.projectedPayoutUsdt,
        needsUnpaidMaturityChoice,
        choiceHours,
        portfolioUrl,
        logoUrl: resolveMailingLogoUrl(),
      })
    );

    const subject = needsUnpaidMaturityChoice
      ? `Action required: your ${fund.name} investment matured`
      : `Your ${fund.name} investment has reached its term`;

    const text = needsUnpaidMaturityChoice
      ? `Your ${fund.name} investment (${investment.amountUsdt.toFixed(2)} USDT) reached its term, but payout is waiting on pool liquidity. ` +
        `Open Portfolio within ${choiceHours} hours to choose wait longer or recover via invites: ${portfolioUrl}`
      : `Your ${fund.name} investment (${investment.amountUsdt.toFixed(2)} USDT) reached its term. ` +
        `Projected payout: ${investment.projectedPayoutUsdt.toFixed(2)} USDT. Track status in Portfolio: ${portfolioUrl}`;

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
      "sendInvestmentMaturedEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
