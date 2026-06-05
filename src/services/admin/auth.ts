import bcrypt from "bcryptjs";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/services/auth/passwordless";
import { sendVerificationMail } from "@/services/mailing/sendOtpEmail";

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function isAdminAllowedEmail(email: string): boolean {
  const allowed = getEnv().adminAllowedEmail?.trim() ?? "";
  if (!allowed) return false;
  return normalizeEmail(email) === allowed;
}

export async function getAdminOtpCooldownRemainingSeconds(
  email: string
): Promise<number> {
  const normalized = normalizeEmail(email);
  const last = await prisma.adminLoginOtp.findFirst({
    where: { email: normalized },
    orderBy: { createdAt: "desc" },
  });
  if (!last?.createdAt) return 0;
  const elapsed = Date.now() - last.createdAt.getTime();
  const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function requestAdminOtp(
  email: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);
  const genericMessage =
    "If this email is authorized, a sign-in code has been sent.";

  if (!isAdminAllowedEmail(normalized)) {
    return { ok: true, message: genericMessage };
  }

  const cooldown = await getAdminOtpCooldownRemainingSeconds(normalized);
  if (cooldown > 0) {
    return {
      ok: false,
      error: `Please wait ${cooldown}s before requesting another code.`,
    };
  }

  await prisma.adminLoginOtp.deleteMany({ where: { email: normalized } });

  const salt = await bcrypt.genSalt(10);
  const otpCode = `${Math.floor(100000 + Math.random() * 900000)}`;
  const hashedOTP = await bcrypt.hash(otpCode, salt);

  await prisma.adminLoginOtp.create({
    data: {
      email: normalized,
      otpCode: hashedOTP,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const mailResult = await sendVerificationMail(
    normalized,
    otpCode,
    "Admin"
  );

  if (!mailResult.ok) {
    console.error("[admin otp] mail failed:", mailResult.error);
    return { ok: false, error: "Could not send email. Please try again." };
  }

  return { ok: true, message: genericMessage };
}

export async function verifyAdminOtp(
  email: string,
  otpCode: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);

  if (!isAdminAllowedEmail(normalized)) {
    return { ok: false, error: "Invalid or expired code" };
  }

  const records = await prisma.adminLoginOtp.findMany({
    where: { email: normalized },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (records.length === 0) {
    return { ok: false, error: "Invalid or expired code" };
  }

  const now = Date.now();
  for (const record of records) {
    if (record.expiresAt.getTime() < now) continue;
    const match = await bcrypt.compare(otpCode, record.otpCode);
    if (match) {
      await prisma.adminLoginOtp.deleteMany({ where: { email: normalized } });
      return { ok: true, email: normalized };
    }
  }

  return { ok: false, error: "Invalid or expired code" };
}
