import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendVerificationMail } from "@/services/mailing/sendOtpEmail";
import { logDevLoginOtp } from "@/lib/devLoginOtpLog";
import { uiSnapshotLog } from "@/lib/uiSnapshotLog";
import { ensureUserHasWallet } from "@/services/wallets/ensureDefaultWallet";
import { issueTokenPair } from "./tokens";

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_TTL_MS = 3600000;

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function deriveNameFromEmail(email: string): string {
  const local = normalizeEmail(email).split("@")[0];
  if (!local) return "Investor";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Investor";
}

async function createAndSendOtp(
  userId: string,
  email: string,
  name: string,
  type: "login",
  { clearExisting = true } = {}
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (clearExisting) {
    await prisma.otpVerification.deleteMany({ where: { userId } });
  }

  const salt = await bcrypt.genSalt(10);
  const otpCode = `${Math.floor(100000 + Math.random() * 900000)}`;
  const hashedOTP = await bcrypt.hash(otpCode, salt);

  await prisma.otpVerification.create({
    data: {
      userId,
      otpCode: hashedOTP,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  if (type !== "login") {
    return { ok: false, error: "Invalid OTP type" };
  }

  logDevLoginOtp(email, otpCode);

  const mailResult = await sendVerificationMail(email, otpCode, name);

  if (!mailResult.ok) {
    console.error("Mail send failed:", mailResult.error);
    return { ok: false, error: "Could not send email. Please try again." };
  }

  return { ok: true, email };
}

export async function getOtpCooldownRemainingSeconds(
  userId: string
): Promise<number> {
  const last = await prisma.otpVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!last?.createdAt) return 0;
  const elapsed = Date.now() - last.createdAt.getTime();
  const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

async function validateOtpForUser(
  userId: string,
  otpCode: string
): Promise<
  | { ok: true }
  | { ok: false; status: number; errors: { msg: string }[] }
> {
  const records = await prisma.otpVerification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!records.length) {
    return {
      ok: false,
      status: 400,
      errors: [{ msg: "The provided code is invalid" }],
    };
  }

  const { expiresAt, otpCode: hashedOTP } = records[0];

  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await prisma.otpVerification.deleteMany({ where: { userId } });
    return {
      ok: false,
      status: 400,
      errors: [
        {
          msg: "Verification code has expired. Please request a new code.",
        },
      ],
    };
  }

  if (!hashedOTP) {
    return {
      ok: false,
      status: 400,
      errors: [{ msg: "The provided code is invalid" }],
    };
  }

  const validOTP = await bcrypt.compare(otpCode, hashedOTP);
  if (!validOTP) {
    return {
      ok: false,
      status: 400,
      errors: [{ msg: "The provided code is invalid" }],
    };
  }

  await prisma.otpVerification.deleteMany({ where: { userId } });
  return { ok: true };
}

export type StartPasswordlessResult =
  | { ok: true; email: string; isNewUser: boolean }
  | { ok: false; status: number; msg: string; retryAfterSeconds?: number };

export async function startPasswordlessAuth(
  emailInput: string
): Promise<StartPasswordlessResult> {
  const email = normalizeEmail(emailInput);

  try {
    let user = await prisma.user.findFirst({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          name: deriveNameFromEmail(email),
          email,
          password: null,
          hasVerifiedMail: false,
        },
      });
      await ensureUserHasWallet(user.id);
    } else {
      const walletCount = await prisma.wallet.count({ where: { userId: user.id } });
      if (walletCount === 0) {
        await ensureUserHasWallet(user.id);
      }
    }

    const retryAfterSeconds = await getOtpCooldownRemainingSeconds(user.id);
    if (retryAfterSeconds > 0) {
      return {
        ok: false,
        status: 429,
        msg: "Please wait before requesting another code.",
        retryAfterSeconds,
      };
    }

    const mailResult = await createAndSendOtp(
      user.id,
      user.email,
      user.name,
      "login"
    );
    if (!mailResult.ok) {
      return { ok: false, status: 500, msg: mailResult.error };
    }

    return { ok: true, email, isNewUser };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return { ok: false, status: 500, msg: "Internal Server Error" };
  }
}

export type VerifyPasswordlessResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { ok: false; status: number; errors?: { msg: string }[]; msg?: string };

export async function verifyPasswordlessAuth(
  emailInput: string,
  otpCode: string,
  userAgent?: string | null
): Promise<VerifyPasswordlessResult> {
  const email = normalizeEmail(emailInput);

  try {
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return {
        ok: false,
        status: 400,
        errors: [{ msg: "Invalid email or code" }],
      };
    }

    const otpResult = await validateOtpForUser(user.id, otpCode);
    if (!otpResult.ok) {
      return { ok: false, status: otpResult.status, errors: otpResult.errors };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { hasVerifiedMail: true },
    });

    await ensureUserHasWallet(user.id);

    const tokens = await issueTokenPair(user.id, { userAgent });
    uiSnapshotLog("auth.login", { userId: user.id, email: user.email });
    return { ok: true, ...tokens };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return { ok: false, status: 500, msg: "Internal Server Error" };
  }
}

export type ResendPasswordlessResult =
  | { ok: true; msg: string }
  | { ok: false; status: number; msg: string; retryAfterSeconds?: number };

export async function resendPasswordlessOtp(
  emailInput: string
): Promise<ResendPasswordlessResult> {
  const email = normalizeEmail(emailInput);

  try {
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return { ok: false, status: 400, msg: "No account found for this email" };
    }

    const retryAfterSeconds = await getOtpCooldownRemainingSeconds(user.id);
    if (retryAfterSeconds > 0) {
      return {
        ok: false,
        status: 429,
        msg: "Please wait before requesting another code.",
        retryAfterSeconds,
      };
    }

    const result = await createAndSendOtp(user.id, user.email, user.name, "login");
    if (!result.ok) {
      return { ok: false, status: 500, msg: result.error };
    }

    return { ok: true, msg: `Code sent to ${result.email}` };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return { ok: false, status: 500, msg: "Internal Server Error" };
  }
}
