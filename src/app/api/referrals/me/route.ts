import { withAuth } from "@/lib/http/withAuth";
import { getReferralsMe } from "@/services/referrals/getReferralsMe";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const data = await getReferralsMe(authUser.id);
    return Response.json(data);
  });
}
