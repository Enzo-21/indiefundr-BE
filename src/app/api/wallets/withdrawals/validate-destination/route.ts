import { withAuth } from "@/lib/http/withAuth";
import { jsonError, validationErrors } from "@/lib/http/route";
import { withdrawDestinationQuerySchema } from "@/lib/validators/withdrawals";
import { validateWithdrawalDestination } from "@/services/wallets/withdrawalDestination";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const url = new URL(request.url);
    const parsed = withdrawDestinationQuerySchema.safeParse({
      address: url.searchParams.get("address") ?? "",
    });
    if (!parsed.success) {
      return jsonError(400, validationErrors(parsed.error));
    }

    const result = await validateWithdrawalDestination(
      authUser.id,
      parsed.data.address
    );
    if (result.valid) {
      return Response.json({
        valid: true,
        normalizedAddress: result.normalizedAddress,
      });
    }
    return Response.json({
      valid: false,
      message: result.message,
    });
  });
}
