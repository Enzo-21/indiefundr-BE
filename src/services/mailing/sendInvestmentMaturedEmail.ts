import { render } from "@react-email/render";
import type { Investment, User } from "@prisma/client";
import InvestmentMaturedPayableEmail from "@/emails/InvestmentMaturedPayableEmail";
import InvestmentMaturedWaitingEmail from "@/emails/InvestmentMaturedWaitingEmail";
import UnpaidMaturityChoiceRequiredEmail from "@/emails/UnpaidMaturityChoiceRequiredEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import type { MaturityEmailScenario } from "@/lib/investments/resolveMaturityEmailScenario";
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
    return investmentId
      ? `/portfolio?openMaturityChoice=${investmentId}`
      : "/portfolio";
  }
  const path = investmentId
    ? `/portfolio?openMaturityChoice=${encodeURIComponent(investmentId)}`
    : "/portfolio";
  return `${base}${path}`;
}

function maturityEmailContent(
  scenario: MaturityEmailScenario,
  params: {
    username: string;
    fundName: string;
    amountUsdt: number;
    projectedPayoutUsdt: number;
    choiceHours: number;
    choiceDeadlineLabel: string;
    portfolioUrl: string;
    logoUrl: string;
  }
): { subject: string; text: string; htmlPromise: Promise<string> } {
  const {
    username,
    fundName,
    amountUsdt,
    projectedPayoutUsdt,
    choiceHours,
    choiceDeadlineLabel,
    portfolioUrl,
    logoUrl,
  } = params;
  const amountLabel = amountUsdt.toFixed(2);
  const payoutLabel = projectedPayoutUsdt.toFixed(2);

  if (scenario === "choice_required") {
    return {
      subject: `Action required: choose how to continue your ${fundName} investment`,
      text:
        `Your ${fundName} investment (${amountLabel} USDT) reached its term but payout is waiting on pool liquidity. ` +
        `Within ${choiceHours} hours, choose wait longer for ${payoutLabel} USDT projected payout or invite friends to recover ${amountLabel} USDT principal: ${portfolioUrl}`,
      htmlPromise: render(
        UnpaidMaturityChoiceRequiredEmail({
          username,
          fundName,
          amountUsdt,
          projectedPayoutUsdt,
          choiceHours,
          choiceDeadlineLabel,
          portfolioUrl,
          logoUrl,
        })
      ),
    };
  }

  if (scenario === "waiting") {
    return {
      subject: `Your ${fundName} investment reached its term`,
      text:
        `Your ${fundName} investment (${amountLabel} USDT) reached its term. ` +
        `Projected payout: ${payoutLabel} USDT. Payout is pending pool liquidity — track status in Portfolio: ${portfolioUrl}`,
      htmlPromise: render(
        InvestmentMaturedWaitingEmail({
          username,
          fundName,
          amountUsdt,
          projectedPayoutUsdt,
          portfolioUrl,
          logoUrl,
        })
      ),
    };
  }

  return {
    subject: `Your ${fundName} investment has reached its term`,
    text:
      `Your ${fundName} investment (${amountLabel} USDT) reached its term. ` +
      `Projected payout: ${payoutLabel} USDT. Track status in Portfolio: ${portfolioUrl}`,
    htmlPromise: render(
      InvestmentMaturedPayableEmail({
        username,
        fundName,
        amountUsdt,
        projectedPayoutUsdt,
        portfolioUrl,
        logoUrl,
      })
    ),
  };
}

export async function sendInvestmentMaturedEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Investment;
  fund: InvestmentFund;
  scenario: MaturityEmailScenario;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, fund, scenario } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const choiceHours = UNPAID_MATURITY_CHOICE_HOURS();
    const portfolioUrl = portfolioDeepLink(
      scenario === "choice_required" ? investment.id : undefined
    );
    const choiceDeadlineLabel =
      investment.unpaidMaturityChoiceDeadlineAt?.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }) ?? "";

    const { subject, text, htmlPromise } = maturityEmailContent(scenario, {
      username: user.name || "",
      fundName: fund.name,
      amountUsdt: investment.amountUsdt,
      projectedPayoutUsdt: investment.projectedPayoutUsdt,
      choiceHours,
      choiceDeadlineLabel,
      portfolioUrl,
      logoUrl: resolveMailingLogoUrl(),
    });

    const html = await htmlPromise;

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
