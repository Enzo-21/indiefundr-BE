import { Resend } from "resend";
import { getEnv } from "@/lib/env";

export function getResendClient() {
  const apiKey = getEnv().resendApiKey;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured. Set it in backend/.env");
  }
  return new Resend(apiKey);
}

export function getResendErrorMessage(error: unknown): string {
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

export function mailingFromAddress(): string {
  return `IndieFundr <accounts@${getEnv().mailingDomain}>`;
}
