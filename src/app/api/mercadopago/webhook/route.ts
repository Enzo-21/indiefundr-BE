import { jsonError } from "@/lib/http/route";
import { handleMercadoPagoWebhook } from "@/services/mercadopago/webhook";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = new URL(request.url);

  const result = await handleMercadoPagoWebhook({
    rawBody,
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    queryDataId: url.searchParams.get("data.id") ?? url.searchParams.get("id"),
    queryType: url.searchParams.get("type") ?? url.searchParams.get("topic"),
  });

  if (!result.ok) {
    return jsonError(result.status, { msg: result.msg });
  }

  return Response.json({ ok: true });
}

/** MP may send GET for URL validation. */
export async function GET() {
  return Response.json({ ok: true });
}
