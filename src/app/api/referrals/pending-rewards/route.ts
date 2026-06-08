import { withAuth } from "@/lib/http/withAuth";
import { getPendingReferralRewards } from "@/services/referrals/getReferralsMe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const rows = await getPendingReferralRewards(authUser.id);
    return Response.json({ rows });
  });
}
