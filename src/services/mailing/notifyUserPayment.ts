import type { Investment, ReferralPayoutOrder, WithdrawalOrder } from "@prisma/client";
import type { InvestmentFund } from "@/lib/config/investmentFunds";
import { getFundById } from "@/lib/config/investmentFunds";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/services/orders/pushNotify";
import { insightsFromRedemption } from "@/services/wallets/transactionInsights";
import { sendUserPaymentEmail } from "./sendUserPaymentEmail";
import {
  referralOrderKindToUserPaymentKind,
  type UserPaymentKind,
} from "./userPaymentReceiptDocument";

export type NotifyUserPaymentParams =
  | {
      kind: "investment_payout";
      investment: Investment;
      txId: string;
      fund?: InvestmentFund | null;
    }
  | {
      kind: Exclude<UserPaymentKind, "investment_payout" | "withdrawal">;
      order: ReferralPayoutOrder;
      txId: string;
    }
  | {
      kind: "withdrawal";
      order: WithdrawalOrder;
      txId: string;
    };

function formatUsdt(value: number): string {
  return value.toFixed(2);
}

function buildPushContent(params: NotifyUserPaymentParams): {
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  const baseData = {
    type: "USER_PAYMENT_COMPLETED",
    kind: params.kind,
  };

  switch (params.kind) {
    case "investment_payout": {
      const fund =
        params.fund ?? getFundById(params.investment.fundId) ?? null;
      const fundName = fund?.name ?? params.investment.fundId;
      const insights = insightsFromRedemption(
        params.investment,
        fund ?? undefined
      );
      const earnings = insights.expectedEarningsUsdt;
      const credited =
        insights.creditedUsdt ?? params.investment.projectedPayoutUsdt;
      return {
        title: "Payout received",
        body: `Congratulations — ${formatUsdt(credited)} USDT from your ${fundName} investment (${formatUsdt(earnings)} earned).`,
        data: {
          ...baseData,
          investmentId: params.investment.id,
          fundId: params.investment.fundId,
        },
      };
    }
    case "withdrawal":
      return {
        title: "Withdrawal sent",
        body: `Your withdrawal of ${formatUsdt(params.order.amountUsdt)} USDT has been sent to your wallet.`,
        data: {
          ...baseData,
          orderId: params.order.id,
        },
      };
    case "principal_recovery":
      return {
        title: "Principal recovered",
        body: `Your principal of ${formatUsdt(params.order.amountUsdt)} USDT has been recovered.`,
        data: {
          ...baseData,
          orderId: params.order.id,
        },
      };
    case "referral_invitee_bonus":
      return {
        title: "Referral bonus received",
        body: `Congratulations — you received your referral welcome bonus of ${formatUsdt(params.order.amountUsdt)} USDT.`,
        data: {
          ...baseData,
          orderId: params.order.id,
        },
      };
    case "referral_inviter_bonus":
      return {
        title: "Referral reward received",
        body: `Congratulations — you earned a referral reward of ${formatUsdt(params.order.amountUsdt)} USDT.`,
        data: {
          ...baseData,
          orderId: params.order.id,
        },
      };
  }
}

function resolveUserId(params: NotifyUserPaymentParams): string {
  switch (params.kind) {
    case "investment_payout":
      return params.investment.userId;
    default:
      return params.order.userId;
  }
}

function buildEmailParams(
  params: NotifyUserPaymentParams,
  user: { email: string | null; name: string | null }
): Parameters<typeof sendUserPaymentEmail>[0] {
  switch (params.kind) {
    case "investment_payout": {
      const fund =
        params.fund ?? getFundById(params.investment.fundId) ?? null;
      if (!fund) {
        throw new Error(`Unknown fund for investment ${params.investment.id}`);
      }
      const insights = insightsFromRedemption(params.investment, fund);
      return {
        kind: params.kind,
        investment: params.investment,
        fund,
        txId: params.txId,
        user,
        emailProps: {
          fundName: fund.name,
          principalUsdt: insights.principalUsdt,
          earningsUsdt: insights.expectedEarningsUsdt,
        },
      };
    }
    case "withdrawal":
      return {
        kind: params.kind,
        order: params.order,
        txId: params.txId,
        paidAt: params.order.adminSettledAt ?? new Date(),
        user,
        emailProps: {
          destinationAddress: params.order.destinationAddress,
        },
      };
    default:
      return {
        kind: params.kind,
        order: params.order,
        txId: params.txId,
        paidAt: new Date(),
        user,
      };
  }
}

function logContext(params: NotifyUserPaymentParams): Record<string, string> {
  switch (params.kind) {
    case "investment_payout":
      return { investmentId: params.investment.id, kind: params.kind };
    case "withdrawal":
      return { orderId: params.order.id, kind: params.kind };
    default:
      return { orderId: params.order.id, kind: params.kind };
  }
}

export async function notifyUserPayment(
  params: NotifyUserPaymentParams
): Promise<void> {
  const userId = resolveUserId(params);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, device: true },
  });

  if (!user) {
    return;
  }

  const push = buildPushContent(params);
  await sendPushNotification(user.device, push.title, push.body, push.data);

  try {
    const emailResult = await sendUserPaymentEmail(buildEmailParams(params, user));
    if (!emailResult.ok) {
      console.error(
        "[mail] user payment email failed:",
        emailResult.error,
        logContext(params)
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[mail] user payment email failed:",
      message,
      logContext(params)
    );
  }
}

export function notifyReferralPayoutOrderCompleted(params: {
  order: ReferralPayoutOrder;
  txId: string;
}): Promise<void> {
  return notifyUserPayment({
    kind: referralOrderKindToUserPaymentKind(params.order.kind),
    order: params.order,
    txId: params.txId,
  });
}
