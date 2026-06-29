import { render } from "@react-email/render";
import type { ForfeitureReason, Investment, User } from "@prisma/client";
import InvestmentForfeitedEmail from "@/emails/InvestmentForfeitedEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import {
  getResendClient,
  getResendErrorMessage,
  mailingFromAddress,
} from "./resendClient";
import { resolveMailingLogoUrl } from "./mailingLogoUrl";
import { portfolioDeepLink } from "./sendInvestmentMaturedEmail";

function forfeitureSubject(
  fundName: string,
  reason: ForfeitureReason
): string {
  switch (reason) {
    case "choice_deadline_expired":
      return `Update: your ${fundName} investment ended — no choice made`;
    case "second_maturity_unpaid":
      return `Update: your ${fundName} extended term ended without payout`;
    case "recovery_window_expired":
      return `Update: your ${fundName} invite recovery window closed`;
    default:
      return `Update: your ${fundName} investment has ended`;
  }
}

export async function sendInvestmentForfeitedEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Pick<Investment, "amountUsdt">;
  fund: InvestmentFund;
  forfeitureReason: ForfeitureReason;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, fund, forfeitureReason } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const portfolioUrl = portfolioDeepLink();

    const html = await render(
      InvestmentForfeitedEmail({
        username: user.name || "",
        fundName: fund.name,
        amountUsdt: investment.amountUsdt,
        forfeitureReason,
        portfolioUrl,
        logoUrl: resolveMailingLogoUrl(),
      })
    );

    const subject = forfeitureSubject(fund.name, forfeitureReason);
    const text =
      `Your ${fund.name} investment (${investment.amountUsdt.toFixed(2)} USDT) has ended. ` +
      `Review details in Portfolio: ${portfolioUrl}`;

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
      "sendInvestmentForfeitedEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
