import { render } from "@react-email/render";
import { Resend } from "resend";
import OtpCodeEmail, { type OtpEmailPurpose } from "@/emails/OtpCodeEmail";
import { getEnv } from "@/lib/env";
import { resolveMailingLogoUrl } from "./mailingLogoUrl";

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

const purposeCopy: Record<
  OtpEmailPurpose,
  {
    subject: (name: string) => string;
    text: (otpCode: string) => string;
  }
> = {
  verification: {
    subject: (name) => `Welcome to IndieFundr${name ? `, ${name}` : ""}!`,
    text: (otpCode) =>
      `Welcome to IndieFundr!\n\nPlease enter this code in the app to verify your account: ${otpCode}\n\nIf you did not sign up, ignore this email.`,
  },
  passwordReset: {
    subject: () => "Reset your IndieFundr password",
    text: (otpCode) =>
      `Please enter this code in the app to create a new password: ${otpCode}\n\nIf you did not request a reset, ignore this email.`,
  },
};

export async function sendOtpEmail({
  name,
  email,
  otpCode,
  purpose,
}: {
  name?: string;
  email: string;
  otpCode: string;
  purpose: OtpEmailPurpose;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resend = getResendClient();
    const env = getEnv();
    const copy = purposeCopy[purpose] ?? purposeCopy.verification;
    const displayName = name || "";

    const html = await render(
      OtpCodeEmail({
        username: displayName,
        otpCode,
        purpose,
        logoUrl: resolveMailingLogoUrl(),
      })
    );

    const { error } = await resend.emails.send({
      from: `IndieFundr <accounts@${env.mailingDomain}>`,
      to: [email],
      subject: copy.subject(displayName),
      text: copy.text(otpCode),
      html,
    });

    if (error) {
      return { ok: false, error: getResendErrorMessage(error) };
    }

    return { ok: true };
  } catch (err) {
    console.error("sendOtpEmail error:", err instanceof Error ? err.message : err);
    return { ok: false, error: getResendErrorMessage(err) };
  }
}

export async function sendVerificationMail(
  email: string,
  otpCode: string,
  name?: string
) {
  return sendOtpEmail({ name, email, otpCode, purpose: "verification" });
}
