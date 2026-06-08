import { withAuth } from "@/lib/http/withAuth";
import { getReferralRedemption } from "@/services/referrals/getReferralsMe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const data = await getReferralRedemption(authUser.id);
    return Response.json(data);
  });
}
