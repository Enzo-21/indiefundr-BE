import { withAuth } from "@/lib/http/withAuth";
import { jsonError, parseJsonBody, validationErrors } from "@/lib/http/route";
import { referralCodeBodySchema } from "@/lib/validators/referrals";
import { redeemReferralCodeManual } from "@/services/referrals/redeemReferralCode";
import { ReferralError, toReferralResponse } from "@/services/referrals/referralErrors";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = referralCodeBodySchema.safeParse(parsed.data);
    if (!body.success) {
      return jsonError(400, validationErrors(body.error));
    }

    try {
      const result = await redeemReferralCodeManual(authUser.id, body.data.code);
      return Response.json(result);
    } catch (error) {
      if (error instanceof ReferralError) {
        return toReferralResponse(error);
      }
      throw error;
    }
  });
}
