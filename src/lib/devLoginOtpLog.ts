import { getEnv } from "@/lib/env";

function isLocalhostHost(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`);
    const host = url.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return trimmed.includes("localhost") || trimmed.includes("127.0.0.1");
  }
}

/** True when login OTP may be printed to the server console (local dev only). */
export function shouldLogLoginOtpToConsole(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
    return false;
  }
  if (process.env.LOG_LOGIN_OTP_TO_CONSOLE === "false") {
    return false;
  }

  const { frontendDomain } = getEnv();
  if (!isLocalhostHost(frontendDomain)) {
    return false;
  }

  const cronDevBase = process.env.CRON_DEV_BASE_URL ?? "";
  if (cronDevBase && !isLocalhostHost(cronDevBase)) {
    return false;
  }

  return true;
}

/** Log plaintext login OTP to the backend terminal (never in production / non-localhost). */
export function logDevLoginOtp(email: string, otpCode: string): void {
  if (!shouldLogLoginOtpToConsole()) {
    return;
  }
  console.log(
    "[auth:dev:login-otp]",
    JSON.stringify({
      email,
      otpCode,
      hint: "development + localhost only — use this code in the app",
    })
  );
}
