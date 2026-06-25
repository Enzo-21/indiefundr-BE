import { render } from "@react-email/render";
import type { Investment, User } from "@prisma/client";
import { UnpaidMaturityResolution } from "@prisma/client";
import UnpaidMaturityChoiceConfirmedEmail from "@/emails/UnpaidMaturityChoiceConfirmedEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { recoveryExpiresAt } from "@/lib/config/referralRecovery";
import { REFERRAL_RECOVERY_INVITEES_REQUIRED } from "@/lib/config/referralRecovery";
import {
  getResendClient,
  getResendErrorMessage,
  mailingFromAddress,
} from "./resendClient";
import { resolveMailingLogoUrl } from "./mailingLogoUrl";
import { portfolioDeepLink } from "./sendInvestmentMaturedEmail";

export async function sendUnpaidMaturityChoiceConfirmedEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Investment;
  fund: InvestmentFund;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, fund } = params;
  const resolution = investment.unpaidMaturityResolution;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  if (
    resolution !== UnpaidMaturityResolution.term_extension &&
    resolution !== UnpaidMaturityResolution.referral_recovery
  ) {
    return { ok: false, error: "Investment has no confirmed maturity choice" };
  }

  try {
    const resend = getResendClient();
    const portfolioUrl = portfolioDeepLink(
      resolution === UnpaidMaturityResolution.referral_recovery
        ? investment.id
        : undefined
    );
    const recoveryExpires =
      investment.recoveryEligibleAt != null
        ? recoveryExpiresAt(investment.recoveryEligibleAt).toISOString()
        : undefined;

    const html = await render(
      UnpaidMaturityChoiceConfirmedEmail({
        username: user.name || "",
        fundName: fund.name,
        amountUsdt: investment.amountUsdt,
        choice: resolution,
        extensionDays: investment.termExtensionDays ?? undefined,
        newMaturesAt: investment.maturesAt?.toISOString(),
        recoveryExpiresAt: recoveryExpires,
        recoveryRequiredCount: REFERRAL_RECOVERY_INVITEES_REQUIRED(),
        portfolioUrl,
        logoUrl: resolveMailingLogoUrl(),
      })
    );

    const subject =
      resolution === UnpaidMaturityResolution.term_extension
        ? `Confirmed: extended term on ${fund.name}`
        : `Confirmed: invite recovery for ${fund.name}`;

    const { error } = await resend.emails.send({
      from: mailingFromAddress(),
      to: [user.email],
      subject,
      html,
    });

    if (error) {
      return { ok: false, error: getResendErrorMessage(error) };
    }

    return { ok: true };
  } catch (err) {
    console.error(
      "sendUnpaidMaturityChoiceConfirmedEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
