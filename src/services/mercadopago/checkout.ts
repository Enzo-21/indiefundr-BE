import { UsdtPurchaseOrderStatus } from "@prisma/client";
import { buildUsdtPurchasePricing } from "@/lib/config/usdtPurchasePricing";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import { ensureUserHasWallet } from "@/services/wallets/ensureDefaultWallet";
import { getUsdtArsQuoteForPurchase } from "@/services/quotes/refreshUsdtArsQuote";
import {
  getMercadoPagoBackUrls,
  getMercadoPagoNotificationUrl,
  isMercadoPagoCheckoutEnabled,
  isMercadoPagoConfigured,
  buildMercadoPagoExternalReference,
} from "./config";
import { createCheckoutPreference, splitPayerName } from "./client";

const QUOTE_UNAVAILABLE_MSG = "Please try again in a few minutes.";

const PRIOR_PURCHASE_STATUSES: UsdtPurchaseOrderStatus[] = [
  UsdtPurchaseOrderStatus.awaiting_admin,
  UsdtPurchaseOrderStatus.paid,
  UsdtPurchaseOrderStatus.completed,
];

export type CreateUsdtCheckoutResult =
  | {
      ok: true;
      orderId: string;
      initPoint: string;
      sandboxInitPoint: string | null;
      pricing: ReturnType<typeof buildUsdtPurchasePricing>;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

export type CreateUsdtCheckoutOptions = {
  deviceId?: string | null;
};

export async function createUsdtMercadoPagoCheckout(
  userId: string,
  request?: Request,
  options: CreateUsdtCheckoutOptions = {}
): Promise<CreateUsdtCheckoutResult> {
  if (!isMercadoPagoCheckoutEnabled()) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "coming_soon",
        msg: "Mercado Pago checkout is not available in this environment.",
      },
    };
  }

  if (!isMercadoPagoConfigured()) {
    return {
      ok: false,
      status: 503,
      body: { msg: "Mercado Pago is not configured on this server." },
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 404, body: { msg: "User not found" } };
  }

  if (user.country !== "AR") {
    return {
      ok: false,
      status: 403,
      body: {
        code: "country_not_supported",
        msg: "Mercado Pago checkout is only available in Argentina.",
      },
    };
  }

  const quote = await getUsdtArsQuoteForPurchase();
  if (!quote.ok) {
    return {
      ok: false,
      status: 503,
      body: {
        code: "quote_unavailable",
        msg: QUOTE_UNAVAILABLE_MSG,
        reason: quote.reason,
      },
    };
  }

  await ensureUserHasWallet(userId);
  const wallet = await getMainWallet(userId);
  if (!wallet) {
    return {
      ok: false,
      status: 503,
      body: {
        msg: "Your wallet is still being prepared. Try again in a moment.",
      },
    };
  }

  const pricing = buildUsdtPurchasePricing({ arsPerUsdt: quote.arsPerUsdt });
  const externalReference = buildMercadoPagoExternalReference(userId);

  const [priorPurchaseCount, lastPurchase] = await Promise.all([
    prisma.usdtPurchaseOrder.count({
      where: {
        userId,
        status: { in: PRIOR_PURCHASE_STATUSES },
      },
    }),
    prisma.usdtPurchaseOrder.findFirst({
      where: {
        userId,
        status: { in: PRIOR_PURCHASE_STATUSES },
      },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  const { name, surname } = splitPayerName(user.name);

  const order = await prisma.usdtPurchaseOrder.create({
    data: {
      userId,
      walletId: wallet.id,
      amountUsdt: pricing.amountUsdt,
      arsPerUsdt: pricing.arsPerUsdt,
      baseArs: pricing.baseArs,
      hiddenMarkupPct: pricing.hiddenMarkupPct,
      mpFeePct: pricing.mpFeePct,
      priceWithMarkupArs: pricing.priceWithMarkupArs,
      mpFeeArs: pricing.mpFeeArs,
      totalArs: pricing.totalArs,
      status: UsdtPurchaseOrderStatus.pending_payment,
      mpExternalReference: externalReference,
    },
  });

  try {
    const preference = await createCheckoutPreference({
      title: "IndieFundr",
      description: "IndieFundr credit",
      categoryId: "services",
      quantity: 1,
      unitPriceArs: pricing.totalArs,
      externalReference,
      deviceId: options.deviceId,
      payer: {
        email: user.email,
        name,
        surname,
        registrationDate: user.date.toISOString(),
        authenticationType: "Web Nativa",
        isPrimeUser: Boolean(user.isPro),
        isFirstPurchaseOnline: priorPurchaseCount === 0,
        lastPurchase: lastPurchase?.date.toISOString() ?? null,
      },
      backUrls: getMercadoPagoBackUrls(),
      notificationUrl: getMercadoPagoNotificationUrl(request),
    });

    await prisma.usdtPurchaseOrder.update({
      where: { id: order.id },
      data: { mpPreferenceId: preference.id },
    });

    return {
      ok: true,
      orderId: order.id,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint,
      pricing,
    };
  } catch (error) {
    await prisma.usdtPurchaseOrder.update({
      where: { id: order.id },
      data: {
        status: UsdtPurchaseOrderStatus.failed,
        failureReason:
          error instanceof Error ? error.message : "Preference creation failed",
      },
    });
    throw error;
  }
}
