import { withAuth } from "@/lib/http/withAuth";
import { jsonError, parseJsonBody, validationErrors } from "@/lib/http/route";
import { withdrawBodySchema } from "@/lib/validators/withdrawals";
import { createWithdrawalOrder } from "@/services/wallets/withdrawals";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = withdrawBodySchema.safeParse(parsed.data);
    if (!body.success) {
      return jsonError(400, validationErrors(body.error));
    }

    const result = await createWithdrawalOrder(authUser.id, body.data);
    if (!result.ok) {
      if (result.plainText && typeof result.body === "string") {
        return new Response(result.body, { status: result.status });
      }
      return jsonError(result.status, result.body);
    }

    return Response.json(result.data, { status: result.status ?? 202 });
  });
}
