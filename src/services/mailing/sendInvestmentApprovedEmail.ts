import { render } from "@react-email/render";
import { Resend } from "resend";
import type { Investment, PurchaseOrder, User } from "@prisma/client";
import InvestmentApprovedEmail from "@/emails/InvestmentApprovedEmail";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { getEnv } from "@/lib/env";
import {
  buildInvestmentReceiptDocument,
  investmentReceiptFilename,
} from "./investmentReceiptDocument";
import { buildReceiptPdfBuffer } from "./investmentReceiptPdf";

function getResendClient() {
  const apiKey = getEnv().resendApiKey;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured. Set it in backend/.env");
  }
  return new Resend(apiKey);
}

function getResendErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Unknown mail provider error";
  }
  const maybeError = error as { message?: string; error?: string; name?: string };
  return (
    maybeError.message ||
    maybeError.error ||
    maybeError.name ||
    "Unknown mail provider error"
  );
}

export async function sendInvestmentApprovedEmail(params: {
  user: Pick<User, "email" | "name">;
  investment: Investment;
  order: PurchaseOrder;
  fund: InvestmentFund;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, investment, order, fund } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const env = getEnv();
    const receiptDocument = buildInvestmentReceiptDocument({
      investment,
      order,
      fund,
    });
    const pdfBuffer = buildReceiptPdfBuffer(receiptDocument);
    const filename = investmentReceiptFilename(order.usdtTxId);

    const html = await render(
      InvestmentApprovedEmail({
        username: user.name || "",
        fundName: fund.name,
        amountUsdt: investment.amountUsdt,
        projectedPayoutUsdt: investment.projectedPayoutUsdt,
        logoUrl: env.mailingLogoUrl,
      })
    );

    const subject = `Your ${fund.name} investment is now active`;
    const text =
      `Congratulations — your ${fund.name} investment has been approved and is now active. ` +
      `We received your ${investment.amountUsdt.toFixed(2)} USDT and our team is working to grow your money ` +
      `toward a projected payout of ${investment.projectedPayoutUsdt.toFixed(2)} USDT. ` +
      "Your receipt is attached to this email.";

    const { error } = await resend.emails.send({
      from: `IndieFundr <accounts@${env.mailingDomain}>`,
      to: [user.email],
      subject,
      text,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      return { ok: false, error: getResendErrorMessage(error) };
    }

    return { ok: true };
  } catch (err) {
    console.error(
      "sendInvestmentApprovedEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
