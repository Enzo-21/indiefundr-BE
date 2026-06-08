import { withAuth } from "@/lib/http/withAuth";
import { getReferralShareSummary } from "@/services/referrals/getReferralsMe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const data = await getReferralShareSummary(authUser.id);
    return Response.json(data);
  });
}
