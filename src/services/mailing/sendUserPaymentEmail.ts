import { render } from "@react-email/render";
import UserPaymentEmail from "@/emails/UserPaymentEmail";
import { getEnv } from "@/lib/env";
import { buildReceiptPdfBuffer } from "./investmentReceiptPdf";
import {
  getResendClient,
  getResendErrorMessage,
  mailingFromAddress,
} from "./resendClient";
import {
  buildUserPaymentReceiptDocument,
  type BuildUserPaymentReceiptDocumentParams,
  userPaymentKindLabel,
  userPaymentReceiptFilename,
} from "./userPaymentReceiptDocument";

export type SendUserPaymentEmailParams = BuildUserPaymentReceiptDocumentParams & {
  user: { email: string | null; name: string | null };
  emailProps?: {
    principalUsdt?: number;
    earningsUsdt?: number;
    fundName?: string;
    destinationAddress?: string;
  };
};

function formatAmountForKind(params: SendUserPaymentEmailParams): string {
  if (params.kind === "investment_payout") {
    return formatUsdt(params.investment.projectedPayoutUsdt);
  }
  return formatUsdt(params.order.amountUsdt);
}

function buildSubject(params: SendUserPaymentEmailParams): string {
  const amount = formatAmountForKind(params);
  switch (params.kind) {
    case "investment_payout":
      return `You earned ${formatUsdt(params.emailProps?.earningsUsdt ?? 0)} USDT from ${params.emailProps?.fundName ?? "your investment"}`;
    case "withdrawal":
      return `Your withdrawal of ${amount} USDT is on the way`;
    case "principal_recovery":
      return `Your principal of ${amount} USDT has been recovered`;
    case "referral_invitee_bonus":
      return `Your referral welcome bonus — ${amount} USDT`;
    case "referral_inviter_bonus":
      return `Your referral reward — ${amount} USDT`;
  }
}

function formatUsdt(value: number): string {
  return value.toFixed(2);
}

function buildPlainText(params: SendUserPaymentEmailParams): string {
  const kind = params.kind;
  const amount = formatAmountForKind(params);
  const label = userPaymentKindLabel(kind);

  let body: string;
  switch (kind) {
    case "investment_payout": {
      const earnings = formatUsdt(params.emailProps?.earningsUsdt ?? 0);
      const principal = formatUsdt(params.emailProps?.principalUsdt ?? 0);
      const fundName = params.emailProps?.fundName ?? "your fund";
      body =
        `Congratulations — you earned ${earnings} USDT on your ${fundName} investment. ` +
        `We sent ${amount} USDT to your wallet (${principal} principal + ${earnings} earnings).`;
      break;
    }
    case "referral_invitee_bonus":
      body = `Congratulations — you received your referral welcome bonus of ${amount} USDT.`;
      break;
    case "referral_inviter_bonus":
      body = `Congratulations — you earned a referral reward of ${amount} USDT.`;
      break;
    case "principal_recovery":
      body = `Your principal of ${amount} USDT has been recovered and sent to your wallet.`;
      break;
    case "withdrawal":
      body = `Your withdrawal of ${amount} USDT has been sent to your wallet.`;
      break;
  }

  return `${body} Your ${label.toLowerCase()} receipt is attached to this email.`;
}

function resolveEmailAmount(params: SendUserPaymentEmailParams): number {
  if (params.kind === "investment_payout") {
    return params.investment.projectedPayoutUsdt;
  }
  return params.order.amountUsdt;
}

export async function sendUserPaymentEmail(
  params: SendUserPaymentEmailParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = params;

  if (!user.email?.trim()) {
    return { ok: false, error: "User email is missing" };
  }

  try {
    const resend = getResendClient();
    const env = getEnv();
    const receiptDocument = buildUserPaymentReceiptDocument(params);
    const pdfBuffer = buildReceiptPdfBuffer(receiptDocument);
    const filename = userPaymentReceiptFilename(params.txId);

    const html = await render(
      UserPaymentEmail({
        username: user.name || "",
        kind: params.kind,
        amountUsdt: resolveEmailAmount(params),
        fundName: params.emailProps?.fundName,
        principalUsdt: params.emailProps?.principalUsdt,
        earningsUsdt: params.emailProps?.earningsUsdt,
        destinationAddress: params.emailProps?.destinationAddress,
        logoUrl: env.mailingLogoUrl,
      })
    );

    const subject = buildSubject(params);
    const text = buildPlainText(params);

    const { error } = await resend.emails.send({
      from: mailingFromAddress(),
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
      "sendUserPaymentEmail error:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, error: getResendErrorMessage(err) };
  }
}
