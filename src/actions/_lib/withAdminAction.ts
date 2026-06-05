import { assertAdminSession } from "@/lib/auth/assertAdminSession";
import { AuthError } from "@/lib/auth/errors";
import { getEnv } from "@/lib/env";
import { isInsufficientWithdrawalError } from "@/services/admin/treasury";
import { PayoutInProgressError } from "@/services/revenueEngine/payoutLock";
import { isRetryableFeeBroadcastError, isInsufficientTrxBalanceError } from "@/services/tron/client";
import {
  actionError,
  actionSuccess,
  type ActionResult,
} from "./actionResult";

const TRON_RATE_LIMIT_MESSAGE =
  "The Tron data provider is rate limiting our on-chain reads. Wallet balances/history may be temporarily unavailable. Wait a minute and refresh, or reduce dashboard/cron polling.";

function tronRateLimitMessageWithHint(): string {
  const rps = getEnv().tronHttpRpsLimit;
  return `${TRON_RATE_LIMIT_MESSAGE} Server limiter is active at ~${rps} req/s per instance; reduce polling or lower wallet/history concurrency settings if this persists.`;
}

type ErrorWithResponse = {
  message?: string;
  status?: number;
  response?: { status?: number };
  cause?: unknown;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const ADMIN_BUSINESS_RULE_MESSAGES = [
  "Order is no longer open",
  "Order already marked failed",
  "Order is already terminal",
  "Order is not manual fulfillment",
  "Purchase order not found",
  "Record USDT payment tx id before marking successful",
  "Transaction id is required",
  "Payout transaction is still pending on-chain",
  "Payout failed on-chain",
  "Cannot confirm payout",
] as const;

export function isAdminBusinessRuleError(message: string): boolean {
  return ADMIN_BUSINESS_RULE_MESSAGES.some(
    (known) => message === known || message.startsWith(known)
  );
}

export function isExternalRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const withResponse = error as ErrorWithResponse;
  if (withResponse.response?.status === 429 || withResponse.status === 429) {
    return true;
  }

  const message = errorMessage(error);
  if (
    /status code 429/i.test(message) ||
    /failed:\s*429/i.test(message) ||
    /too many requests/i.test(message) ||
    /rate limit/i.test(message)
  ) {
    return true;
  }

  return withResponse.cause ? isExternalRateLimitError(withResponse.cause) : false;
}

export async function withAdminAction<T>(
  handler: (session: { createdBy: string }) => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const session = await assertAdminSession();
    const data = await handler({ createdBy: session.createdBy });
    return actionSuccess(data);
  } catch (error) {
    if (error instanceof AuthError) {
      return actionError(error.code, error.msg);
    }
    if (error instanceof PayoutInProgressError) {
      return actionError("CONFLICT", error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (isInsufficientWithdrawalError(message)) {
      return actionError("BAD_REQUEST", message);
    }
    if (isAdminBusinessRuleError(message)) {
      return actionError("BAD_REQUEST", message);
    }
    if (isRetryableFeeBroadcastError(message)) {
      return actionError("RETRYABLE_FUEL", message);
    }
    if (isInsufficientTrxBalanceError(message)) {
      return actionError("BAD_REQUEST", message);
    }
    if (isExternalRateLimitError(error)) {
      console.warn("[admin action] Tron provider rate limit:", message);
      return actionError("TRON_RATE_LIMIT", tronRateLimitMessageWithHint());
    }
    console.error("[admin action]", message);
    return actionError("INTERNAL_ERROR", "Internal server error");
  }
}
