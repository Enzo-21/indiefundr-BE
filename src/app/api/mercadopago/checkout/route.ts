import { withAuth } from "@/lib/http/withAuth";
import { internalError, jsonError } from "@/lib/http/route";
import { createUsdtMercadoPagoCheckout } from "@/services/mercadopago/checkout";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      const result = await createUsdtMercadoPagoCheckout(authUser.id, request);
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
