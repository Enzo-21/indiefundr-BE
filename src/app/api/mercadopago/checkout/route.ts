import { withAuth } from "@/lib/http/withAuth";
import { internalError, jsonError } from "@/lib/http/route";
import { createUsdtMercadoPagoCheckout } from "@/services/mercadopago/checkout";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      let deviceId: string | null = null;
      try {
        const body = (await request.json()) as { deviceId?: unknown };
        if (typeof body?.deviceId === "string" && body.deviceId.trim()) {
          deviceId = body.deviceId.trim();
        }
      } catch {
        // Empty body is fine — Device ID is optional.
      }

      const result = await createUsdtMercadoPagoCheckout(authUser.id, request, {
        deviceId,
      });
      if (!result.ok) {
        return jsonError(result.status, result.body);
      }

      return Response.json({
        orderId: result.orderId,
        initPoint: result.initPoint,
        sandboxInitPoint: result.sandboxInitPoint,
        pricing: result.pricing,
      });
    } catch (error) {
      console.error(
        "[mercadopago:checkout]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
