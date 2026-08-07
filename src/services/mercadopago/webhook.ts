import { UsdtPurchaseOrderStatus } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  fetchMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "./client";

export async function handleMercadoPagoWebhook(input: {
  rawBody: string;
  xSignature: string | null;
  xRequestId: string | null;
  queryDataId: string | null;
  queryType: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(input.rawBody || "{}") as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const dataObj =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const dataId =
    input.queryDataId ||
    (dataObj && dataObj.id != null ? String(dataObj.id) : null) ||
    (typeof payload.id === "string" || typeof payload.id === "number"
      ? String(payload.id)
      : null);

  const type =
    input.queryType ||
    (typeof payload.type === "string" ? payload.type : null) ||
    (typeof payload.topic === "string" ? payload.topic : null);

  if (!getEnv().mpWebhookSecret) {
    console.warn(
      "[mercadopago:webhook] MP_WEBHOOK_SECRET unset — skipping signature check"
    );
  } else if (
    !verifyMercadoPagoWebhookSignature({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId,
    })
  ) {
    return { ok: false, status: 401, msg: "Invalid webhook signature" };
  }

  // Topic can be "payment" or action payment.updated — always resolve payment id.
  if (type && !/payment/i.test(type) && type !== "payment") {
    return { ok: true };
  }

  if (!dataId) {
    return { ok: true };
  }

  let payment;
  try {
    payment = await fetchMercadoPagoPayment(dataId);
  } catch (error) {
    console.error(
      "[mercadopago:webhook] fetch payment failed",
      error instanceof Error ? error.message : error
    );
    return { ok: false, status: 502, msg: "Could not fetch payment" };
  }

  if (!payment.externalReference) {
    return { ok: true };
  }

  const order = await prisma.usdtPurchaseOrder.findUnique({
    where: { mpExternalReference: payment.externalReference },
  });
  if (!order) {
    console.warn(
      "[mercadopago:webhook] unknown external_reference",
      payment.externalReference
    );
    return { ok: true };
  }

  // Idempotent: already past payment
  if (
    order.status === UsdtPurchaseOrderStatus.awaiting_admin ||
    order.status === UsdtPurchaseOrderStatus.completed ||
    order.status === UsdtPurchaseOrderStatus.paid
  ) {
    if (!order.mpPaymentId) {
      await prisma.usdtPurchaseOrder.update({
        where: { id: order.id },
        data: { mpPaymentId: payment.id },
      });
    }
    return { ok: true };
  }

  if (payment.status === "approved") {
    await prisma.usdtPurchaseOrder.update({
      where: { id: order.id },
      data: {
        status: UsdtPurchaseOrderStatus.awaiting_admin,
        mpPaymentId: payment.id,
      },
    });
    return { ok: true };
  }

  if (
    payment.status === "rejected" ||
    payment.status === "cancelled" ||
    payment.status === "refunded"
  ) {
    if (order.status === UsdtPurchaseOrderStatus.pending_payment) {
      await prisma.usdtPurchaseOrder.update({
        where: { id: order.id },
        data: {
          status: UsdtPurchaseOrderStatus.failed,
          mpPaymentId: payment.id,
          failureReason: `MP payment ${payment.status}`,
        },
      });
    }
  }

  return { ok: true };
}
