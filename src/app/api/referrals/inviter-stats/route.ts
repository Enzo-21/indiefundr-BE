import { withAuth } from "@/lib/http/withAuth";
import { getReferralInviterStats } from "@/services/referrals/getReferralsMe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const data = await getReferralInviterStats(authUser.id);
    return Response.json(data);
  });
}
